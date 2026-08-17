-- Two changes that travel together because both widen what a question can be:
--   1. the author picks a linear scale's range (0—10, -3—3, x—y) instead of
--      every scale being 1—5;
--   2. SHORT_ANSWER — the first question type with NO options.
--
-- Guarded throughout (V3/V11/V14/V15 pattern): MySQL commits DDL implicitly,
-- so a re-run must not die on errno 1060/1061 with no way back.

-- ── 1. The range the author chose ────────────────────────────────────────
--
-- NULLABLE, then backfilled — the V11 pattern, and NOT NULL is impossible
-- here anyway: the pair is meaningless on an MCQ and MySQL cannot make a
-- column conditionally required. The backfill is what matters; code still
-- reads a NULL pair as 1—5, so a row written around the API can never render
-- an empty scale.
--
-- Physical names are snake_case (`scale_from`): the entity's
-- @Column(name = "scaleFrom") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores strategy lowercases with underscores. Get this wrong
-- and ddl-auto: validate refuses to boot.
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'scale_from'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
  'ALTER TABLE `question`
     ADD COLUMN `scale_from` int DEFAULT NULL AFTER `question_type`,
     ADD COLUMN `scale_to`   int DEFAULT NULL AFTER `scale_from`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Every scale that exists today is 1—5. Recording that is not a change of
-- meaning: their generated points and derived scores stay exactly as they are.
UPDATE `question`
   SET `scale_from` = 1, `scale_to` = 5
 WHERE `question_type` = 'LINEAR_SCALE'
   AND `scale_from` IS NULL;

-- ── 2. The new types ─────────────────────────────────────────────────────
--
-- Widening a MySQL enum REBUILDS the table, which is why V14 pre-listed
-- LIKERT_GRID before anything wrote it. Same trick again: PARAGRAPH (long
-- answer) is listed now so the next text type costs no DDL. Nothing writes it
-- — QuestionController refuses it until the UI exists.
SET @has_short := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'question_type'
      AND COLUMN_TYPE LIKE '%SHORT_ANSWER%'
);
SET @ddl := IF(@has_short > 0, 'SELECT 1',
  'ALTER TABLE `question`
     MODIFY COLUMN `question_type`
       enum(''MCQ'',''LINEAR_SCALE'',''LIKERT_GRID'',''SHORT_ANSWER'',''PARAGRAPH'')
       NOT NULL DEFAULT ''MCQ''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. The unique key, second edition ────────────────────────────────────
--
-- V15 wrapped question_row_id in COALESCE because MySQL treats NULLs as never
-- equal, so a nullable column in a unique key stops constraining the rows
-- where it is null. option_id is NULL on a short answer — the identical trap,
-- one column over: two identical text answers for one question would both
-- insert, and a duplicate submit would stop being a clean 400.
--
-- Same fix, and the same ordering rule: the OLD key is the only index
-- starting with respondent_user_id, so it is the index fkAaRespondent depends
-- on. The new key goes in BEFORE the old one comes out, or errno 1553.
--
-- With both parts wrapped the key reads "one row per (respondent, assessment,
-- question, row, option)" for every type at once — and on a short answer,
-- where both are null, it collapses to one row per question, which is exactly
-- what one text answer means.
SET @new_key := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment_answer'
      AND INDEX_NAME   = 'uqAaRespondentAssessmentQuestionRowOptionV2'
);
SET @ddl := IF(@new_key > 0, 'SELECT 1',
  'ALTER TABLE `assessment_answer`
     ADD UNIQUE KEY `uqAaRespondentAssessmentQuestionRowOptionV2` (
       `respondent_user_id`,`assessment_id`,`question_id`,
       ((COALESCE(`question_row_id`,0))),((COALESCE(`option_id`,0))))');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old_key := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment_answer'
      AND INDEX_NAME   = 'uqAaRespondentAssessmentQuestionRowOption'
);
SET @ddl := IF(@old_key = 0, 'SELECT 1',
  'ALTER TABLE `assessment_answer` DROP INDEX `uqAaRespondentAssessmentQuestionRowOption`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
