-- Per-assessment terms & conditions body, replacing the consent text the
-- portal used to hardcode.
--
-- TEXT (64 KB) is far above the 20 000-character cap the API enforces, and
-- the stored markup is a tiny tag subset (see AssessmentTerms) — nothing like
-- the base64 payload that made `logo_base64` LONGTEXT.
--
-- NULL-able, and NULL is meaningful: it means "this assessment predates the
-- field", and readers substitute AssessmentTerms.DEFAULT_HTML. That is why
-- there is no backfill here — writing the default into every existing row
-- would freeze today's wording into assessments whose owners never chose it,
-- and later edits to the default would not reach them.
--
-- Physical column is snake_case (`terms_and_conditions`): the entity's
-- @Column(name = "termsAndConditions") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores naming strategy lowercases with underscores — same
-- as `show_terms_and_conditions` in V1. Get this wrong and ddl-auto: validate
-- refuses to boot.
--
-- Guard first: plain ADD COLUMN would fail with errno 1060 if a prior manual
-- patch already added it and, because MySQL commits DDL implicitly, could not
-- roll back. The prepared statement no-ops when the column already exists.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment'
      AND COLUMN_NAME  = 'terms_and_conditions'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `assessment` ADD COLUMN `terms_and_conditions` TEXT NULL AFTER `show_terms_and_conditions`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
