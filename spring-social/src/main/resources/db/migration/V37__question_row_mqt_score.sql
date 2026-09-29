-- Grid rows carry their own MQ/MQT scores (2026-09-29).
--
-- question_row_mqt was created by V15 as a pure NOMINATION — which MQTs a
-- grid row measures — with the number coming from the column the respondent
-- picked. The row now scores like an MCQ option: `score` is what answering
-- the row is worth on that MQT, earned whatever column is picked. The column
-- is the ANSWER, recorded and exported per row, not the number. The column
-- scores of V15 still apply wherever an author typed them: this is an
-- addition, not a replacement.
--
-- DOUBLE, not DECIMAL: the entity field is a plain `double` and Hibernate's
-- validate compares the mapped type (the V25 reasoning). DEFAULT 0 is the
-- correct value for every existing row, not a placeholder: no row has ever
-- carried a score, and 0 is exactly "nomination only", which is what each
-- one has always meant — so there is no UPDATE step.
--
-- Guarded (V11/V14/V36 pattern): MySQL commits DDL implicitly, so a re-run
-- must be a no-op rather than a failure with no way back.
SET @has_score := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question_row_mqt'
      AND COLUMN_NAME  = 'score'
);

SET @ddl := IF(
    @has_score > 0,
    'SELECT 1',
    'ALTER TABLE `question_row_mqt`
        ADD COLUMN `score` DOUBLE NOT NULL DEFAULT 0
        AFTER `measured_quality_type_id`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
