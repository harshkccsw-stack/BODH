-- Game results (2026-10-06): the numbers a finished game produced.
--
-- A GAMES question is answered by finishing its game — that pick is the
-- assessment_answer row (its option IS the game). This table holds what the
-- game measured, ONE ROW PER PART of the game: Attention Baseline is one part,
-- Color Clash + Mackworth Clock is two. Every part reports the same core
-- metrics, so one set of columns serves every game and a new game with the
-- same shape needs no DDL. Columns a part does not measure stay NULL.
--
-- Counts use the research terms: hits (correct responses), false_alarms
-- (responses with nothing to respond to), omissions (targets let go by).
-- duration_ms is time spent playing the part, pauses EXCLUDED; started_at /
-- ended_at are the browser's clock at the part's start and end, so they
-- include pauses. group_* is the group picked at the start of the combined
-- game, stored on BOTH of its rows.
--
-- Attached to the answer row it details, ON DELETE CASCADE: the answer set is
-- replaced on every submit, cleared by a practitioner reset and replaced by a
-- MemoryMesh sync, and the results must go with it on every one of those
-- paths. game_id is kept beside it (no cascade — a game with results cannot be
-- deleted), and game_version is a COPY taken at submit time, because a game's
-- version can be bumped afterwards.
--
-- Written only inside the submit's own transaction (AssessmentSubmissionWriter,
-- digest or synchronous fallback), right after the answer rows.

CREATE TABLE IF NOT EXISTS `game_result` (
  `game_result_id` bigint NOT NULL AUTO_INCREMENT,
  `assessment_answer_id` bigint NOT NULL,
  `game_id` bigint NOT NULL,
  `game_version` int NOT NULL,
  `part_code` varchar(40) NOT NULL,
  `part_order` int NOT NULL,
  `hits` int NOT NULL,
  `false_alarms` int NOT NULL,
  `omissions` int NOT NULL,
  `duration_ms` bigint NOT NULL,
  `mouse_distance_px` bigint NOT NULL,
  `mouse_idle_seconds` int NOT NULL,
  `instruction_time_ms` bigint DEFAULT NULL,
  `group_number` int DEFAULT NULL,
  `group_name` varchar(30) DEFAULT NULL,
  `pause_count` int DEFAULT NULL,
  `pause_duration_ms` bigint DEFAULT NULL,
  `started_at` datetime(6) DEFAULT NULL,
  `ended_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`game_result_id`),
  UNIQUE KEY `uqGrAnswerPart` (`assessment_answer_id`, `part_code`),
  KEY `idxGrGame` (`game_id`),
  CONSTRAINT `fkGrAnswer` FOREIGN KEY (`assessment_answer_id`)
      REFERENCES `assessment_answer` (`assessment_answer_id`) ON DELETE CASCADE,
  CONSTRAINT `fkGrGame` FOREIGN KEY (`game_id`) REFERENCES `game` (`game_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
