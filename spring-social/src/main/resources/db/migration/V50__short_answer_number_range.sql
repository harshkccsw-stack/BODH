-- The range a Number short answer accepts (2026-10-09): an optional floor
-- and an optional cap on the whole number typed (V48's WHOLE_NUMBER format),
-- so "on a scale of 1 to 5" cannot be answered 10. Either end may be set
-- alone ("18 or more", "up to 100"); both NULL is any whole number, which is
-- what every question meant before this — no backfill.
--
-- NULL on every other question and on a TEXT short answer; the question flow
-- clears both whenever the format is not WHOLE_NUMBER. BIGINT because a whole
-- number may be up to 15 digits (AnswerFormat.WHOLE_NUMBER_PATTERN), past
-- INT. Once a question has answers the range may only WIDEN — enforced in
-- QuestionController, not here.
--
-- Physical columns are snake_case: @Column(name = "answerMin") is a logical
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
      AND COLUMN_NAME  = 'answer_min'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `question`
        ADD COLUMN `answer_min` bigint NULL DEFAULT NULL AFTER `answer_format`,
        ADD COLUMN `answer_max` bigint NULL DEFAULT NULL AFTER `answer_min`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
