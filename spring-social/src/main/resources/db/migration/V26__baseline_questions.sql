-- The baseline: a short Likert set ("A few questions", 1..5) every respondent
-- answers once, right after consent. Authored on MemoryMesh, mirrored here
-- through /api/sync/memorymesh/baseline/* so both systems hold the questions
-- AND the answers.
--
-- Deliberately NOT the question bank. A bank question carries content types,
-- options, MQT scores and placements; these are one line of text and a number
-- from one to five, and dragging them through that machinery would make a
-- thirty-item survey look like thirty assessments.
--
-- Guard: CREATE TABLE IF NOT EXISTS makes a re-run a no-op — MySQL commits DDL
-- implicitly and cannot roll it back.
CREATE TABLE IF NOT EXISTS `baseline_question` (
  `baseline_question_id` bigint        NOT NULL AUTO_INCREMENT,
  `text`                 varchar(1000) NOT NULL,
  `sort_order`           int           NOT NULL,
  `active`               bit(1)        NOT NULL,
  `created_at`           datetime(6)   NOT NULL,
  `updated_at`           datetime(6)   NOT NULL,
  PRIMARY KEY (`baseline_question_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per (respondent, question). `answer_value`, not `value`: VALUE is
-- reserved in H2, where the tests run.
CREATE TABLE IF NOT EXISTS `baseline_answer` (
  `baseline_answer_id`   bigint      NOT NULL AUTO_INCREMENT,
  `respondent_user_id`   bigint      NOT NULL,
  `baseline_question_id` bigint      NOT NULL,
  `answer_value`         int         NOT NULL,
  `recorded_at`          datetime(6) NOT NULL,
  PRIMARY KEY (`baseline_answer_id`),
  UNIQUE KEY `uqBaRespondentQuestion` (`respondent_user_id`, `baseline_question_id`),
  KEY `fkBaQuestion` (`baseline_question_id`),
  CONSTRAINT `fkBaRespondent` FOREIGN KEY (`respondent_user_id`)   REFERENCES `respondent_user` (`id`),
  CONSTRAINT `fkBaQuestion`   FOREIGN KEY (`baseline_question_id`) REFERENCES `baseline_question` (`baseline_question_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
