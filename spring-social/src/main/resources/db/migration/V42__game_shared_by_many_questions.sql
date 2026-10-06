-- A game may sit behind MANY questions (2026-10-06).
--
-- V41 linked question_option → game ONE-TO-ONE: a unique key on game_id, so
-- each game could back a single bank question. That is relaxed to
-- MANY-TO-ONE: any number of GAMES questions — in one questionnaire or many —
-- may each launch the same game. What stays one is the other side: a GAMES
-- question still has exactly one option (QuestionController generates it),
-- and that option points at one game.
--
-- The unique key is the ONLY index under fkQuestionOptionGame, so dropping it
-- alone fails with errno 1553. A plain index on game_id goes in FIRST, then
-- the unique key comes out — two steps, each guarded, so a re-run (or a run
-- interrupted between them, MySQL DDL being uncommittable) is a no-op.

-- ── 1. The plain index the FK will rest on ──────────────────────────────────
SET @has_idx := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question_option'
      AND INDEX_NAME   = 'idxQuestionOptionGame'
);
SET @ddl := IF(
    @has_idx > 0,
    'SELECT 1',
    'ALTER TABLE `question_option` ADD INDEX `idxQuestionOptionGame` (`game_id`)'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 2. The one-to-one rule goes ─────────────────────────────────────────────
SET @has_uq := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question_option'
      AND INDEX_NAME   = 'uqQuestionOptionGame'
);
SET @ddl := IF(
    @has_uq > 0,
    'ALTER TABLE `question_option` DROP INDEX `uqQuestionOptionGame`',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
