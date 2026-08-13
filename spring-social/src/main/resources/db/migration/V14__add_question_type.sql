-- Question type (the Google-Forms style dropdown) plus the two labels a
-- linear scale puts under its first and last point.
--
-- `question_type` is NOT NULL DEFAULT 'MCQ': MySQL fills every existing row
-- with MCQ in the same statement, and MCQ is exactly what every question
-- meant before this column existed — so the backfill is the default and the
-- "add NULL, UPDATE, then MODIFY NOT NULL" rule does not apply.
--
-- The enum already lists LIKERT_GRID even though the grid ships in a later
-- migration: widening a MySQL enum later is a table rebuild, and listing a
-- value nothing writes yet costs nothing.
--
-- Physical columns are snake_case (`question_type`, `scale_low_label`): the
-- entity's @Column(name = "questionType") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores naming strategy lowercases with underscores — same
-- as `content_type` / `selection_rule`. Get this wrong and ddl-auto: validate
-- refuses to boot.
--
-- Guard first: a plain ADD COLUMN would fail with errno 1060 if a prior
-- manual patch already added the columns and, because MySQL commits DDL
-- implicitly, could not roll back. All three columns are added by ONE
-- statement, so probing for `question_type` covers them all.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'question_type'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `question`
       ADD COLUMN `question_type` enum(''MCQ'',''LINEAR_SCALE'',''LIKERT_GRID'')
           NOT NULL DEFAULT ''MCQ'' AFTER `content_type`,
       ADD COLUMN `scale_low_label`  varchar(100) DEFAULT NULL AFTER `question_type`,
       ADD COLUMN `scale_high_label` varchar(100) DEFAULT NULL AFTER `scale_low_label`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
