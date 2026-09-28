-- FREE_TEXT option — the Google-Forms "Other…" row on an MCQ (2026-09-28).
--
-- An option the respondent picks like any other and then TYPES into: the
-- answer row carries the optionId AND answerText together. Nothing changes
-- on assessment_answer — the V17 key already reads "one row per
-- (respondent, assessment, question, row, option)" with both nullable parts
-- COALESCEd, and an Other answer is exactly one such row with text on it.
--
-- The one structural change is the option's content_type enum gaining the
-- value. Widening a MySQL enum rebuilds the table; question_option is small.
--
-- `question.content_type` is deliberately NOT widened: a stem "made of" a
-- text box means nothing, QuestionController refuses it, and Hibernate's
-- validate compares the column's type NAME (enum), never its member list, so
-- the two columns may legitimately differ. Were a FREE_TEXT stem ever to slip
-- past the API, MySQL's data-truncation error is the right outcome.
--
-- Guarded (V11/V14/V17 pattern): MySQL commits DDL implicitly, so a re-run
-- must be a no-op rather than a failure with no way back.
SET @has_free_text := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question_option'
      AND COLUMN_NAME  = 'content_type'
      AND COLUMN_TYPE LIKE '%FREE_TEXT%'
);

SET @ddl := IF(
    @has_free_text > 0,
    'SELECT 1',
    'ALTER TABLE `question_option`
        MODIFY COLUMN `content_type`
          enum(''IMAGE'',''TEXT'',''URL'',''VIDEO'',''FREE_TEXT'') NOT NULL'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
