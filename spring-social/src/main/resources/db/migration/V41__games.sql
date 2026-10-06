-- Games (2026-10-06): a GAMES question launches a browser game.
--
-- Three pieces:
--   1. `game` — the catalog. One row per playable game. `code` is what the
--      portal looks up in its hardcoded registry to decide WHICH component to
--      render, so it is unique; `version` is informational (bumped when a
--      game's rules change) and travels with every result the portal records.
--      `active` = offered for NEW questions; a retired game keeps working on
--      the questions already built on it.
--   2. `question_option.game_id` — the mapping, ONE-TO-ONE: a GAMES question
--      has exactly one option and that option is the game. The unique key is
--      what makes it 1:1 — a game sits behind at most one bank question, and
--      reaching it from several questionnaires is what placements are for.
--      NULL on every other option, and MySQL never treats two NULLs as equal,
--      so the key constrains game options only.
--   3. `question.question_type` gains GAMES, APPENDED — inserting mid-list
--      renumbers every stored row (same rule as V22's Gender).
--
-- Physical names are snake_case (`game_id`, `question_type`): the entities'
-- camelCase @Column names are LOGICAL, lowered by CamelCaseToUnderscores.
--
-- Guarded throughout (V11/V14/V17/V36 pattern): MySQL commits DDL implicitly,
-- so a re-run must be a no-op rather than a failure with no way back.

-- ── 1. The catalog ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `game` (
  `game_id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text,
  `active` bit(1) NOT NULL DEFAULT b'1',
  `version` int NOT NULL DEFAULT 1,
  PRIMARY KEY (`game_id`),
  UNIQUE KEY `uqGameCode` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 2. The option → game link ───────────────────────────────────────────────
-- One ALTER, so InnoDB's atomic DDL adds the column, the key and the FK
-- together or not at all.
SET @has_game_id := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question_option'
      AND COLUMN_NAME  = 'game_id'
);
SET @ddl := IF(
    @has_game_id > 0,
    'SELECT 1',
    'ALTER TABLE `question_option`
        ADD COLUMN `game_id` bigint DEFAULT NULL,
        ADD UNIQUE KEY `uqQuestionOptionGame` (`game_id`),
        ADD CONSTRAINT `fkQuestionOptionGame` FOREIGN KEY (`game_id`) REFERENCES `game` (`game_id`)'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 3. The question type ────────────────────────────────────────────────────
-- Widening a MySQL enum rebuilds the table; `question` is small.
SET @has_games := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'question_type'
      AND COLUMN_TYPE LIKE '%GAMES%'
);
SET @ddl := IF(
    @has_games > 0,
    'SELECT 1',
    'ALTER TABLE `question`
        MODIFY COLUMN `question_type`
          enum(''MCQ'',''LINEAR_SCALE'',''LIKERT_GRID'',''SHORT_ANSWER'',''PARAGRAPH'',''GAMES'')
          NOT NULL DEFAULT ''MCQ'''
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 4. The two games the portal ships with ──────────────────────────────────
-- Their codes are keys in the portal's registry (bodhassess-portal
-- src/games/registry.ts) — rename one there and here together, through
-- PUT /api/games/update/{id}. Inserted only when absent, so a re-run adds
-- nothing.
INSERT INTO `game` (`code`, `name`, `description`, `active`, `version`)
SELECT 'BASELINE', 'Attention Baseline',
       'Letter cancellation: click every copy of the target letter, two timed rounds.',
       b'1', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `game` WHERE `code` = 'BASELINE');

INSERT INTO `game` (`code`, `name`, `description`, `active`, `version`)
SELECT 'COLOR_CLASH_MACKWORTH', 'Color Clash + Mackworth Clock',
       'Group selection, then Color Clash (Stroop) followed by the Mackworth Clock vigilance task.',
       b'1', 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `game` WHERE `code` = 'COLOR_CLASH_MACKWORTH');
