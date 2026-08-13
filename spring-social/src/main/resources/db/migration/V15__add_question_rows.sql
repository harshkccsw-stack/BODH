-- Likert grid: rows (the items) alongside the options a grid uses as its
-- shared columns, the MQTs each row measures, and the row an answer belongs
-- to.
--
-- Scoring is unchanged machinery: the COLUMN carries the numbers, in the
-- OptionMqtScore rows an MCQ's options already use. A row only NOMINATES the
-- MQTs it measures, so a pick on row R of column C credits R's MQTs with C's
-- score. That is why question_row_mqt has no score column.
--
-- Every statement is guarded (V3/V11/V14 pattern): MySQL commits DDL
-- implicitly, so a re-run must not die on errno 1050/1060 with no way back.

-- ── 1. The rows themselves ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `question_row` (
  `question_row_id` bigint      NOT NULL AUTO_INCREMENT,
  `question_id`     bigint      NOT NULL,
  `row_text`        text,
  `sort_order`      int         NOT NULL,
  PRIMARY KEY (`question_row_id`),
  KEY `idxQrQuestion` (`question_id`),
  CONSTRAINT `fkQrQuestion` FOREIGN KEY (`question_id`)
      REFERENCES `question` (`question_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. What each row measures ────────────────────────────────────────────
-- No score column on purpose: the number comes from the column picked.
CREATE TABLE IF NOT EXISTS `question_row_mqt` (
  `question_row_mqt_id`      bigint NOT NULL AUTO_INCREMENT,
  `question_row_id`          bigint NOT NULL,
  `measured_quality_type_id` bigint NOT NULL,
  PRIMARY KEY (`question_row_mqt_id`),
  UNIQUE KEY `uqQrmRowMqt` (`question_row_id`,`measured_quality_type_id`),
  KEY `idxQrmMqt` (`measured_quality_type_id`),
  CONSTRAINT `fkQrmRow` FOREIGN KEY (`question_row_id`)
      REFERENCES `question_row` (`question_row_id`),
  CONSTRAINT `fkQrmMqt` FOREIGN KEY (`measured_quality_type_id`)
      REFERENCES `measured_quality_type` (`measured_quality_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. Which row an answer belongs to ────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment_answer'
      AND COLUMN_NAME  = 'question_row_id'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
  'ALTER TABLE `assessment_answer`
     ADD COLUMN `question_row_id` bigint DEFAULT NULL AFTER `option_id`,
     ADD CONSTRAINT `fkAaQuestionRow` FOREIGN KEY (`question_row_id`)
         REFERENCES `question_row` (`question_row_id`)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4. Widen the unique key ──────────────────────────────────────────────
-- A grid legitimately repeats (question, option) once per row, so the old
-- four-column key has to go. Two traps, both load-bearing:
--
--   * MySQL treats NULLs as NEVER EQUAL, so simply appending the nullable
--     question_row_id would silently stop the key constraining every
--     NON-grid answer — and that key is what turns a duplicated submit into
--     a clean 400 instead of a rollback-only 500 at commit. The functional
--     key part over COALESCE(question_row_id, 0) keeps it strict for both
--     (MySQL 8.0.13+; staging is 8.0.46). Hibernate's validate never
--     inspects index expressions, so ddl-auto: validate is happy.
--
--   * The OLD key is the only index starting with respondent_user_id, which
--     makes it the index fkAaRespondent depends on. Dropping it FIRST is
--     errno 1553 — so the new key is added BEFORE the old one is dropped.
SET @new_key := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment_answer'
      AND INDEX_NAME   = 'uqAaRespondentAssessmentQuestionRowOption'
);
SET @ddl := IF(@new_key > 0, 'SELECT 1',
  'ALTER TABLE `assessment_answer`
     ADD UNIQUE KEY `uqAaRespondentAssessmentQuestionRowOption` (
       `respondent_user_id`,`assessment_id`,`question_id`,
       ((COALESCE(`question_row_id`,0))),`option_id`)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old_key := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment_answer'
      AND INDEX_NAME   = 'uqAaRespondentAssessmentQuestionOption'
);
SET @ddl := IF(@old_key = 0, 'SELECT 1',
  'ALTER TABLE `assessment_answer` DROP INDEX `uqAaRespondentAssessmentQuestionOption`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
