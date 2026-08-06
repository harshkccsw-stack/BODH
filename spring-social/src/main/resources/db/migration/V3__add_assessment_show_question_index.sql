-- Per-assessment toggle for the portal's question index/navigator panel.
--
-- The panel was always shown before this became configurable, so the column
-- is NOT NULL DEFAULT 1 — every existing assessment keeps showing the index,
-- and only assessments created/edited with the checkbox off will hide it.
--
-- Physical column is snake_case (`show_question_index`, bit(1)): the entity's
-- @Column(name = "showQuestionIndex") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores naming strategy lowercases with underscores — same
-- as `auto_next` / `show_terms_and_conditions` in V1. Get this wrong and
-- ddl-auto: validate refuses to boot.
--
-- Guard first: plain ADD COLUMN, so if a prior manual patch already added the
-- column the ALTER would fail with errno 1060 and, because MySQL commits DDL
-- implicitly, could not roll back. The prepared statement below no-ops when
-- the column already exists, so a re-run is safe.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment'
      AND COLUMN_NAME  = 'show_question_index'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `assessment` ADD COLUMN `show_question_index` BIT(1) NOT NULL DEFAULT 1 AFTER `auto_next`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
