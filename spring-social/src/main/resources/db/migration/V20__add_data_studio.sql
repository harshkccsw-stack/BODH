-- Data Studio: workbooks, sheets, computed columns, co-ownership grants,
-- dashboards and widgets. Ported from the previous Spring codebase's
-- `analytics` package and re-pointed at this schema's assessment model.
--
-- Six new tables and NOT ONE alteration to an existing one. That is the whole
-- point of the design: Data Studio stores DEFINITIONS — which assessment a
-- sheet is bound to, what formula somebody wrote, how a dashboard is laid out
-- — and never a copy of assessment data. Every sheet open re-reads the live
-- rows and recomputes, so there is nothing here to backfill, nothing to keep
-- in step with the answer tables, and nothing that goes stale if this feature
-- is left alone for a year.
--
-- Consequences of that worth stating, because they are what make these tables
-- cheap to own:
--
--   * No respondent PII lives here. A workbook holds an assessment id inside
--     a JSON filter and nothing else about anybody.
--   * Nothing references `assessment` by foreign key. A sheet names its
--     assessment inside `source_filters` instead, because the binding is
--     expected to grow more keys (organization today; date windows, cohorts
--     later) and every one of those would otherwise be another migration.
--     The cost is that deleting an assessment leaves a sheet pointing at
--     nothing — handled at read time, where it 404s with a message, rather
--     than by blocking a delete in an unrelated part of the product.
--   * The JSON columns (`source_filters`, `display_state`, `layout`,
--     `config`) are TEXT holding JSON on purpose. Their shape belongs to the
--     frontend and changes with it; the backend only guarantees the round
--     trip and never parses them.
--
-- Foreign keys DO exist for ownership and containment, and they are what
-- keeps this consistent: a workbook cannot outlive its owner, a sheet cannot
-- outlive its workbook, a widget cannot outlive its dashboard. The one
-- reference that is NOT containment is `ds_widget.ds_sheet_id` — a tile
-- pointing at a sheet. That FK is what makes "delete this sheet" refusable
-- while a dashboard still draws from it; the service pre-checks it and
-- answers 409, and this constraint is the net behind that pre-check.
--
-- Deletion order therefore matters and is done explicitly in
-- DsWorkbookService, not by cascade: widgets, then dashboards, then computed
-- columns, then sheets, then shares, then the workbook. Cascading would let
-- the database pick an order in which a sheet delete hits the widget FK.
--
-- Guard: CREATE TABLE IF NOT EXISTS throughout. MySQL commits DDL implicitly
-- and cannot roll it back, so a re-run — after a partial apply, or on a
-- database somebody already patched by hand — has to be a no-op rather than
-- merely unlikely. The tables are created parent-first so no FK can point at
-- something that does not exist yet.
--
-- Physical names are snake_case: the entities' @Table("DsWorkbook") /
-- @Column("sourceFilters") are LOGICAL names that Hibernate's
-- CamelCaseToUnderscores strategy lowercases with underscores. Get one wrong
-- and ddl-auto: validate refuses to boot.

-- A workbook: one analyst's project.
CREATE TABLE IF NOT EXISTS `ds_workbook` (
  `ds_workbook_id` bigint       NOT NULL AUTO_INCREMENT,
  `name`           varchar(160) NOT NULL,
  `description`    varchar(512) DEFAULT NULL,

  -- The dashboard user who created it. Not a loose id: a workbook whose owner
  -- is gone has no access rule left, so blocking that delete is correct.
  `owner_user_id`  bigint       NOT NULL,

  `created_at`     datetime(6)  NOT NULL,
  `updated_at`     datetime(6)  NOT NULL,

  PRIMARY KEY (`ds_workbook_id`),
  KEY `fkDsWorkbookOwner` (`owner_user_id`),
  CONSTRAINT `fkDsWorkbookOwner` FOREIGN KEY (`owner_user_id`) REFERENCES `User` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Co-ownership: another dashboard user let into a workbook.
CREATE TABLE IF NOT EXISTS `ds_workbook_share` (
  `ds_workbook_share_id` bigint      NOT NULL AUTO_INCREMENT,
  `ds_workbook_id`       bigint      NOT NULL,
  `shared_with_user_id`  bigint      NOT NULL,

  -- EDITOR changes everything but the share list; VIEWER reads only.
  `role`                 varchar(12) NOT NULL,

  -- Who granted it, as a bare id rather than an FK: this records an ACT, and
  -- "who let them in" must still be answerable after that account is gone —
  -- the same reasoning as activity_log.actor_user_id.
  `granted_by_user_id`   bigint      NOT NULL,

  `created_at`           datetime(6) NOT NULL,

  PRIMARY KEY (`ds_workbook_share_id`),

  -- One grant per pair. Without this a second insert would shadow the first
  -- with a different role and the effective permission would depend on which
  -- row the query happened to read.
  UNIQUE KEY `uqDsShareWorkbookUser` (`ds_workbook_id`, `shared_with_user_id`),
  KEY `fkDsShareUser` (`shared_with_user_id`),
  CONSTRAINT `fkDsShareWorkbook` FOREIGN KEY (`ds_workbook_id`)
      REFERENCES `ds_workbook` (`ds_workbook_id`),
  CONSTRAINT `fkDsShareUser` FOREIGN KEY (`shared_with_user_id`) REFERENCES `User` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A sheet: one assessment's live rows plus computed columns and display state.
CREATE TABLE IF NOT EXISTS `ds_sheet` (
  `ds_sheet_id`     bigint       NOT NULL AUTO_INCREMENT,
  `ds_workbook_id`  bigint       NOT NULL,
  `name`            varchar(160) NOT NULL,

  -- Carried forward from the v1 design so a second view can be added without
  -- a migration; today the only value is 'assessment' / 'respondent_attempt'.
  `source_view`     varchar(40)  NOT NULL,
  `grain`           varchar(32)  NOT NULL,

  -- The binding, as JSON: {"assessmentId": 12, "organizationId": 3}.
  `source_filters`  text,
  -- Column order, widths, hidden, sort. Opaque to the backend.
  `display_state`   text,

  `sort_order`      int          NOT NULL,
  `created_at`      datetime(6)  NOT NULL,
  `updated_at`      datetime(6)  NOT NULL,

  PRIMARY KEY (`ds_sheet_id`),
  KEY `fkDsSheetWorkbook` (`ds_workbook_id`),
  CONSTRAINT `fkDsSheetWorkbook` FOREIGN KEY (`ds_workbook_id`)
      REFERENCES `ds_workbook` (`ds_workbook_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A user-defined computed column — the spreadsheet feature itself.
CREATE TABLE IF NOT EXISTS `ds_derived_column` (
  `ds_derived_column_id` bigint       NOT NULL AUTO_INCREMENT,
  `ds_sheet_id`          bigint       NOT NULL,

  -- Stable identity, e.g. 'calc:z_anxiety'. Generated once from the label and
  -- then frozen: other formulas reference the column by this key, so a rename
  -- that regenerated it would break them silently.
  `col_key`              varchar(80)  NOT NULL,
  `label`                varchar(160) NOT NULL,

  -- Formula SOURCE in the closed whitelisted grammar. Never SQL, never
  -- evaluated as code — see ExpressionService.
  `expr`                 text         NOT NULL,

  -- CLIENT | SERVER. A hint about where the formula COULD run cheaply, not a
  -- claim about where it must: the sheet's data endpoint computes every
  -- column server-side either way, so the two can never disagree.
  `eval_target`          varchar(8)   NOT NULL,
  `result_type`          varchar(16)  NOT NULL,
  `format`               varchar(40)  DEFAULT NULL,
  `sort_order`           int          NOT NULL,

  PRIMARY KEY (`ds_derived_column_id`),

  -- Two columns with one key on a sheet would make every formula referencing
  -- it ambiguous, and evaluation order decides which one wins.
  UNIQUE KEY `uqDsColSheetKey` (`ds_sheet_id`, `col_key`),
  CONSTRAINT `fkDsColSheet` FOREIGN KEY (`ds_sheet_id`) REFERENCES `ds_sheet` (`ds_sheet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A dashboard: a canvas of widgets inside a workbook.
CREATE TABLE IF NOT EXISTS `ds_dashboard` (
  `ds_dashboard_id` bigint       NOT NULL AUTO_INCREMENT,
  `ds_workbook_id`  bigint       NOT NULL,
  `name`            varchar(160) NOT NULL,
  -- Grid metadata (columns, row height) as opaque JSON.
  `layout`          text,
  `sort_order`      int          NOT NULL,
  `created_at`      datetime(6)  NOT NULL,
  `updated_at`      datetime(6)  NOT NULL,

  PRIMARY KEY (`ds_dashboard_id`),
  KEY `fkDsDashboardWorkbook` (`ds_workbook_id`),
  CONSTRAINT `fkDsDashboardWorkbook` FOREIGN KEY (`ds_workbook_id`)
      REFERENCES `ds_workbook` (`ds_workbook_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One tile on a dashboard.
CREATE TABLE IF NOT EXISTS `ds_widget` (
  `ds_widget_id`    bigint      NOT NULL AUTO_INCREMENT,
  `ds_dashboard_id` bigint      NOT NULL,

  -- CHART | KPI | TABLE | PIVOT | TEXT. A varchar rather than an enum: the
  -- set is expected to grow, and adding a member to a MySQL enum is an ALTER
  -- on a table the dashboard is reading.
  `type`            varchar(16) NOT NULL,

  -- The data binding. NULL for TEXT. This is a REFERENCE, not containment —
  -- a sheet outlives any tile drawing from it — so nothing cascades along it
  -- and this FK is what lets "delete this sheet" be refused with a 409 while
  -- a dashboard still depends on it.
  `ds_sheet_id`     bigint      DEFAULT NULL,

  -- Type-specific JSON: chart kind, dimension, measures, filters, TEXT body.
  `config`          text,

  -- 12-column grid: `w` is the span and `sort_order` the flow position.
  -- pos_x / pos_y / h are stored for a free-form canvas the current UI does
  -- not use yet.
  `pos_x`           int         DEFAULT NULL,
  `pos_y`           int         DEFAULT NULL,
  `w`               int         DEFAULT NULL,
  `h`               int         DEFAULT NULL,
  `sort_order`      int         NOT NULL,

  PRIMARY KEY (`ds_widget_id`),
  KEY `fkDsWidgetDashboard` (`ds_dashboard_id`),
  KEY `fkDsWidgetSheet` (`ds_sheet_id`),
  CONSTRAINT `fkDsWidgetDashboard` FOREIGN KEY (`ds_dashboard_id`)
      REFERENCES `ds_dashboard` (`ds_dashboard_id`),
  CONSTRAINT `fkDsWidgetSheet` FOREIGN KEY (`ds_sheet_id`) REFERENCES `ds_sheet` (`ds_sheet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
