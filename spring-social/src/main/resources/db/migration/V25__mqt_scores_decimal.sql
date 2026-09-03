-- MQT scoring edges hold a decimal score.
--
-- ── What and why ──────────────────────────────────────────────────────────
-- `question_mqt_score.score` and `option_mqt_score.score` were `int`, so an
-- author could only say a question or an option is worth 1, 2, 3 … Real
-- instruments weight in fractions — an option that half-counts toward a trait
-- is 0.5, a quarter-step scale runs 0.25 / 0.5 / 0.75 — and every one of those
-- rounded to a whole number on the way in.
--
-- DOUBLE, not DECIMAL: the Java side is a plain `double` (MqtScoreRequest,
-- the entities, MqtScoringService's maps), and Hibernate's `validate` compares
-- the mapped type against the column — a DECIMAL column under a `double`
-- field is exactly the drift `ddl-auto: validate` exists to refuse. Values are
-- rounded to 2 decimals in ONE place on the way in (QuestionController#dedupe)
-- and again on the way out of the scoring engine, so what is stored is what
-- the author typed and a sum of quarters never exports as 8.999999999999998.
--
-- int → DOUBLE is a WIDENING change: every existing row keeps its value
-- exactly (5 becomes 5.0), nothing can round or truncate, and there is nothing
-- to backfill. Going back the other way would silently truncate, so this is
-- one-way in practice.
--
-- Guard first: MODIFY on an already-converted column would succeed but rebuild
-- the table for nothing, and MySQL commits DDL implicitly so a surprise here
-- could not roll back. Each statement below no-ops when its column is already
-- a double.
SET @qms_is_int := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question_mqt_score'
      AND COLUMN_NAME  = 'score'
      AND DATA_TYPE    = 'int'
);

SET @ddl := IF(
    @qms_is_int = 0,
    'SELECT 1',
    'ALTER TABLE `question_mqt_score` MODIFY COLUMN `score` DOUBLE NOT NULL'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @oms_is_int := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'option_mqt_score'
      AND COLUMN_NAME  = 'score'
      AND DATA_TYPE    = 'int'
);

SET @ddl := IF(
    @oms_is_int = 0,
    'SELECT 1',
    'ALTER TABLE `option_mqt_score` MODIFY COLUMN `score` DOUBLE NOT NULL'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
