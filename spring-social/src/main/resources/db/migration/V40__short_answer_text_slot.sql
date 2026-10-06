-- A SHORT_ANSWER's typed answer gets an option_id too (2026-10-06).
--
-- Every other answer row carries an option_id. A short answer's did not,
-- because the type has no options. Data Studio and the reports want one shape
-- for every answer, so each SHORT_ANSWER question now owns ONE generated
-- option: FREE_TEXT, no label, sort_order 0, never authored and never shown
-- (Question.choiceOptions hides it from every payload that lists options).
-- The answer row then reads exactly like an "Other…" answer: option_id AND
-- answer_text. One question's slot is shared by every respondent; the answer
-- row's respondent and assessment are what tell their answers apart.
--
-- Nothing structural changes. The V17 key already COALESCEs option_id, and
-- with the slot filled in it still reads "one row per short-answer question".
--
-- From now on the question flow creates the slot (QuestionController.
-- desiredOptions) and both answer writers attach it. This backfills what
-- already exists:
--   1. the slot, for every SHORT_ANSWER question with no option at all;
--   2. option_id, on every short-answer answer row that has none.
-- Data only, no DDL, so Flyway's transaction covers it: a failure rolls the
-- whole thing back.

-- Guard, refuse to run. A SHORT_ANSWER question has never been allowed an
-- option, so the only option one may own is the generated slot (present if
-- this was ever run by hand). Anything else — a labelled option, a non-text
-- one, or more than one — means step 2 could pin answers onto an option
-- nobody meant. Abort BEFORE any write, with an error that names the problem
-- (a query on a column that does not exist), and sort it out by hand.
SET @odd := (
    SELECT COUNT(*)
    FROM `question` q
    JOIN `question_option` o ON o.`question_id` = q.`question_id`
    WHERE q.`question_type` = 'SHORT_ANSWER'
      AND (o.`content_type` <> 'FREE_TEXT'
           OR o.`option_text` IS NOT NULL
           OR (SELECT COUNT(*) FROM `question_option` o2
               WHERE o2.`question_id` = q.`question_id`) > 1)
);
SET @guard := IF(
    @odd > 0,
    'SELECT `short_answer_questions_with_unexpected_options_fix_by_hand_first` FROM `question`',
    'SELECT 1'
);
PREPARE stmt FROM @guard;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1. The slot. Only where the question owns no option yet, so a re-run adds
--    nothing.
INSERT INTO `question_option`
    (`content_type`, `media_url`, `option_text`, `description`, `sort_order`, `question_id`)
SELECT 'FREE_TEXT', NULL, NULL, NULL, 0, q.`question_id`
FROM `question` q
WHERE q.`question_type` = 'SHORT_ANSWER'
  AND NOT EXISTS (SELECT 1 FROM `question_option` o WHERE o.`question_id` = q.`question_id`);

-- 2. The answers. A short answer is one row per (respondent, assessment,
--    question), so pointing each at its question's single slot can never
--    collide on the unique key.
UPDATE `assessment_answer` a
JOIN `question` q ON q.`question_id` = a.`question_id`
JOIN `question_option` o ON o.`question_id` = q.`question_id`
SET a.`option_id` = o.`option_id`
WHERE q.`question_type` = 'SHORT_ANSWER'
  AND o.`content_type` = 'FREE_TEXT'
  AND a.`option_id` IS NULL
  AND a.`question_row_id` IS NULL;
