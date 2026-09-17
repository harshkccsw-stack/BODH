-- Report engine, phase P1: the HTML template and its tag bindings.
--
-- Two new tables, NOT ONE alteration to an existing one. See
-- docs/report-engine-build-plan.md for the whole design; what matters here is
-- the shape and why it is this shape.
--
-- A template is the deliverable a customer signs off on. Its `${tag}`
-- placeholders ARE the specification: on save the HTML is parsed, the tags are
-- extracted, and a `report_tag_binding` row is created for each NEW tag and
-- removed for each one that vanished. So the authoring screen is a checklist
-- that starts complete-and-unbound ("9 of 14 tags bound, 5 to go") rather than
-- a form somebody has to guess the field names for.
--
-- P1 ships only the two binders that need no computation:
--
--   CORE    - respondent name, dob, organization, assessment date, report date
--   LITERAL - fixed text: headings, boilerplate, disclaimers
--
-- That is deliberate and is what makes this phase shippable on its own: a real
-- report renders, as a real PDF, with no rules, no generated code, no sandbox
-- and no AI anywhere near it. VALUE / NARRATIVE / TABLE / CHART arrive in P2+
-- when `report_computation` exists; `binder_type` already admits them so that
-- is a new row value, not a migration.
--
-- Deliberately absent, and each absence is a decision:
--
--   * No FK to `assessment`. A template is portable — the same counselling
--     layout serves many assessments — and the (assessment x template) pairing
--     lives in `report_definition`, which is P2's migration, not this one.
--   * No FK to `organization` on the template. `organization_id` is a nullable
--     scoping hint for the library UI; a template with NULL is global. Making
--     it an FK would block deleting an org that once had a draft template.
--   * No `report_computation_id` on the binding yet. P2 adds those columns
--     when the computation tables exist to point at. Adding a column later is
--     cheap; adding an FK to a table that does not exist is impossible.
--
-- Guard: CREATE TABLE IF NOT EXISTS throughout. MySQL commits DDL implicitly
-- and cannot roll it back, so a re-run — after a partial apply, or against a
-- database somebody patched by hand — has to be a no-op rather than merely
-- unlikely. Parent first, so no FK points at something not yet created.
--
-- Physical names are snake_case: the entities' @Table("ReportTemplate") /
-- @Column("tagsJson") are LOGICAL names that Hibernate's
-- CamelCaseToUnderscores strategy lowercases with underscores. Get one wrong
-- and ddl-auto: validate refuses to boot.

-- The template: one HTML document with ${tag} placeholders.
CREATE TABLE IF NOT EXISTS `report_template` (
  `report_template_id` bigint       NOT NULL AUTO_INCREMENT,
  `name`               varchar(160) NOT NULL,
  `description`        varchar(512) DEFAULT NULL,

  -- The authored HTML. LONGTEXT because a two-page clinical report with an
  -- inline base64 logo and several inline SVG charts passes 64 KB easily, and
  -- TEXT would truncate it SILENTLY on a non-strict connection.
  `html`               longtext     NOT NULL,

  -- JSON array of the ${tag} names parsed out of `html`, in document order.
  -- Derived, never authored: it is rewritten from the HTML on every save. It
  -- exists so the library list can show "14 tags" without parsing every
  -- template's HTML on every page load.
  `tags_json`          text         DEFAULT NULL,

  -- DRAFT | PUBLISHED | ARCHIVED. A DRAFT may have unbound tags; publishing
  -- is what refuses them (and runs the template lint — see below).
  `status`             varchar(12)  NOT NULL DEFAULT 'DRAFT',

  -- Bumped on publish, never on save. Versions are what let a report issued
  -- last March still be explicable this September.
  `version`            int          NOT NULL DEFAULT 1,

  -- Nullable scoping hint, NOT an FK (see header). NULL = available to all.
  `organization_id`    bigint       DEFAULT NULL,

  `created_by_user_id` bigint       DEFAULT NULL,
  `created_at`         datetime(6)  NOT NULL,
  `updated_at`         datetime(6)  NOT NULL,

  PRIMARY KEY (`report_template_id`),

  -- One row per (name, version). Publishing v2 of "Counselling report" is a
  -- new row, so the name alone cannot be unique.
  UNIQUE KEY `uqRtNameVersion` (`name`, `version`),

  KEY `idxRtStatus` (`status`),
  KEY `idxRtOrganization` (`organization_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per ${tag} found in the template, holding the answer to
-- "what fills this?".
CREATE TABLE IF NOT EXISTS `report_tag_binding` (
  `report_tag_binding_id` bigint      NOT NULL AUTO_INCREMENT,

  -- Containment: a binding cannot outlive its template. This is the one FK
  -- here and it IS a cascade candidate — but the delete is done explicitly in
  -- ReportTemplateService (bindings, then template) rather than by ON DELETE
  -- CASCADE, matching how DsWorkbookService orders its deletes.
  `report_template_id`    bigint      NOT NULL,

  -- The placeholder name as it appears between ${ and } in the HTML.
  `tag`                   varchar(80) NOT NULL,

  -- CORE | LITERAL today; VALUE | NARRATIVE | TABLE | CHART from P2.
  -- UNBOUND is the state a freshly-parsed tag starts in — it is a real value
  -- and not a null, because "nobody has answered this yet" is exactly what
  -- the authoring checklist counts.
  `binder_type`           varchar(16) NOT NULL DEFAULT 'UNBOUND',

  -- CORE only: which respondent/attempt fact fills the tag. One of the keys
  -- in ReportCoreFields — validated in the service, not by the schema,
  -- because the set grows with the product and a CHECK would be a migration.
  `core_field`            varchar(40)  DEFAULT NULL,

  -- LITERAL only: the fixed text.
  `literal_text`          text         DEFAULT NULL,

  -- Optional display format hint, e.g. a date pattern. NULL = as-is.
  `format`                varchar(40)  DEFAULT NULL,

  -- Printed when the value resolves to null. NULL here means print nothing —
  -- which is different from printing the word "null", and is the default.
  `fallback_text`         varchar(255) DEFAULT NULL,

  -- The practitioner's own note about what this tag is for. Free text, read
  -- by humans in P1; from P4 it is also what the meta-prompt sends the model
  -- as the per-tag guidance.
  `author_note`           text         DEFAULT NULL,

  -- Document order of the tag's FIRST occurrence, so the authoring checklist
  -- lists tags the way they appear on the page rather than alphabetically.
  `sort_order`            int         NOT NULL DEFAULT 0,

  PRIMARY KEY (`report_tag_binding_id`),

  -- A tag appears once in the checklist however many times it appears in the
  -- HTML. This is what makes the save-time reconcile an upsert-by-tag.
  UNIQUE KEY `uqRtbTemplateTag` (`report_template_id`, `tag`),

  CONSTRAINT `fkRtbTemplate` FOREIGN KEY (`report_template_id`)
    REFERENCES `report_template` (`report_template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
