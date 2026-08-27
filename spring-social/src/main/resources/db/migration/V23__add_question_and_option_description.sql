-- Optional description on a question and on each of its options.
--
-- Help text, not a second stem: a line under the question ("Answer for the
-- last two weeks") or under an option ("about once a month") that clarifies
-- what is being asked without lengthening the thing being asked. It is
-- RESPONDENT-FACING — authored behind a checkbox in the question form and
-- rendered under the stem / option label in the portal.
--
-- TEXT, matching `stem` and `option_text` next to it. NULLABLE with no
-- backfill: every existing question and option simply has none, which renders
-- exactly as it did before this column existed. NULL and '' both mean "no
-- description" — the controller normalises blank to NULL so there is only one
-- of them on file.
--
-- Not frozen by answers, unlike option TEXT. An AssessmentAnswer points at an
-- option_id and never at a description, so re-wording one strands nothing —
-- the same reasoning that leaves `shuffle_options` editable on an answered
-- question. QuestionController updates descriptions in place rather than
-- through rebuildOptions, so editing one never replaces the option rows.
--
-- Guard first: plain ADD COLUMNs, so a prior manual patch would make these
-- fail with errno 1060, and MySQL commits DDL implicitly so the failure could
-- not roll back. Each prepared statement no-ops when its column already
-- exists, making a re-run safe.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'description'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `question` ADD COLUMN `description` TEXT NULL AFTER `stem`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Separate statement: a second table, and the guard has to be re-evaluated.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question_option'
      AND COLUMN_NAME  = 'description'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `question_option` ADD COLUMN `description` TEXT NULL AFTER `option_text`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
