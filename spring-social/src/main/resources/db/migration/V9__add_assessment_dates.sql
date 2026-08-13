-- Availability window on an assessment: start date + end date, both optional.
--
-- METADATA ONLY at the time of writing — nothing reads these to gate a
-- respondent; only `status` does. They exist so the Create Assessment page
-- can record the window an assessment is meant to run in.
--
-- Both NULL-able, so every existing row means "no window" and no backfill is
-- needed. DATE (not DATETIME): the form collects dd/mm/yyyy and the entity
-- maps them to java.time.LocalDate.
--
-- Physical columns are snake_case (`start_date`, `end_date`): the entity's
-- @Column(name = "startDate") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores naming strategy lowercases with underscores — same
-- as `show_question_index` in V3. Get this wrong and ddl-auto: validate
-- refuses to boot.
--
-- Guard first: plain ADD COLUMN would fail with errno 1060 if a prior manual
-- patch already added either column and, because MySQL commits DDL
-- implicitly, could not roll back. Each prepared statement below no-ops when
-- its column already exists, so a re-run is safe.
SET @start_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment'
      AND COLUMN_NAME  = 'start_date'
);

SET @ddl := IF(
    @start_exists > 0,
    'SELECT 1',
    'ALTER TABLE `assessment` ADD COLUMN `start_date` DATE NULL AFTER `show_question_index`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @end_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment'
      AND COLUMN_NAME  = 'end_date'
);

SET @ddl := IF(
    @end_exists > 0,
    'SELECT 1',
    'ALTER TABLE `assessment` ADD COLUMN `end_date` DATE NULL AFTER `start_date`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
