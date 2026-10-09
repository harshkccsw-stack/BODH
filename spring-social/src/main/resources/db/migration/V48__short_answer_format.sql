-- What a SHORT_ANSWER accepts: free TEXT (what every short answer meant
-- before this existed) or a WHOLE_NUMBER (digits only — 0, 1, 2 … — checked
-- by the portal and by the submit validator). A rule on the same shape, not a
-- new question type: the answer is stored exactly like any short answer, as
-- text on the question's hidden text slot (V40), so nothing that writes or
-- reads answers changes. Data Studio declares a WHOLE_NUMBER question's
-- column numeric. Scoring is untouched — still earned for answering.
--
-- NULL on every other type, and on a short answer it is stored RESOLVED (the
-- V17 scale-range pattern): the backfill below writes TEXT onto every short
-- answer that exists, so "no format" and "text" are never two states of one
-- question. A Redis content entry cached before this column reads the new
-- field as null = TEXT — the permissive side, so a stale entry can let text
-- through for a while but can never block a respondent.
--
-- ENUM like question_type: new values go at the END of the list — inserting
-- mid-list renumbers stored rows (see V22).
--
-- Physical column is snake_case: @Column(name = "answerFormat") is a logical
-- name that Hibernate's CamelCaseToUnderscores strategy lowers (see V35).
--
-- Guarded: a plain ADD COLUMN fails with errno 1060 if the column is already
-- there and, MySQL committing DDL implicitly, could not roll back. The probe
-- makes a re-run a no-op.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'answer_format'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `question`
        ADD COLUMN `answer_format` enum(''TEXT'',''WHOLE_NUMBER'') NULL DEFAULT NULL
        AFTER `scale_high_label`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Every short answer on file accepts text today; recording that is not a
-- change of meaning.
UPDATE `question`
   SET `answer_format` = 'TEXT'
 WHERE `question_type` = 'SHORT_ANSWER'
   AND `answer_format` IS NULL;
