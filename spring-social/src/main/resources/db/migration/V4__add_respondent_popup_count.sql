-- Per-attempt "focus" popup tally: how many times the portal's inactivity
-- popup ("Focus on your assessment") was dismissed during this attempt.
--
-- Attempt-level metric, so it lives on the allotment row (one per respondent+
-- assessment) — NOT on AssessmentAnswer, which is one row per selected option
-- and would duplicate the count across every answer. The submit writes it
-- alongside the answers; the reset zeroes it; the raw-data export surfaces it.
--
-- NOT NULL DEFAULT 0: every existing attempt predates the feature and had no
-- popups, so 0 is the correct backfill and new attempts start clean.
--
-- Physical column is snake_case (`pop_up_count`): the entity's
-- @Column(name = "popUpCount") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores naming strategy lowercases with underscores — same as
-- `is_persisted` / `assessment_status` on this table. Get this wrong and
-- ddl-auto: validate refuses to boot.
--
-- Guard first: plain ADD COLUMN implicitly commits and cannot roll back, so if
-- a prior manual patch already added the column the ALTER would fail with
-- errno 1060. The prepared statement below no-ops when the column exists, so a
-- re-run is safe.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'respondent_assessment_mapping'
      AND COLUMN_NAME  = 'pop_up_count'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `respondent_assessment_mapping` ADD COLUMN `pop_up_count` INT NOT NULL DEFAULT 0 AFTER `is_persisted`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
