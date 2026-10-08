-- V45: when an attempt was started and when it was completed (2026-10-08).
--
-- Both live on respondent_assessment_mapping — the one row per (respondent,
-- assessment) whose status already moves NOT_STARTED → ONGOING → COMPLETED,
-- next to pop_up_count, the other attempt-level fact. Stored in UTC like
-- every other DATETIME here (the JDBC URL pins serverTimezone=UTC).
--
--   started_at    the FIRST begin of the current attempt. A re-launch of an
--                 ONGOING attempt re-enters the demographics but keeps it.
--   completed_at  the moment the submit reached the server — NOT when the
--                 digest later wrote the answers to MySQL, which can lag by
--                 retries or a manual requeue. A MemoryMesh attempt carries
--                 its own completedAt.
--
-- Both NULLABLE for good: a NOT_STARTED attempt has neither, an ONGOING one
-- has no completion, and a reset (or the attention-timer abandon) clears them.
--
-- Guarded per column like V32, so a re-run is a no-op.

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'respondent_assessment_mapping'
      AND COLUMN_NAME  = 'started_at'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
    'ALTER TABLE `respondent_assessment_mapping` ADD COLUMN `started_at` DATETIME(6) DEFAULT NULL AFTER `pop_up_count`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'respondent_assessment_mapping'
      AND COLUMN_NAME  = 'completed_at'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
    'ALTER TABLE `respondent_assessment_mapping` ADD COLUMN `completed_at` DATETIME(6) DEFAULT NULL AFTER `started_at`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Backfill from the activity trail, ONLY where it has a record ──────────
--
-- Nothing else ever recorded these times. activity_log logs every request
-- (since V7, 365-day retention by default, and its writer drops rows rather
-- than block under load), so it is best effort: an attempt it cannot speak
-- for stays NULL — never guessed. Every request counted is a 2xx POST, which
-- also skips the CORS preflights logged before 2026-10-05. The attempt id is
-- the last path segment; path_template picks the endpoint.
--
-- A reset (Reports Hub / org member popup) or an abandon (attention timer)
-- ends an attempt, so the newest one is a boundary: only what came AFTER it
-- belongs to the current attempt.
--   completed_at  COMPLETED rows: the newest submit after the boundary. None
--                 after it means the completion came another way (a
--                 MemoryMesh sync, which is logged without an attempt id).
--   started_at    ONGOING rows, and COMPLETED rows given a completed_at above:
--                 the EARLIEST begin after the boundary, never after the
--                 completion.
-- NOT_STARTED rows get neither.

UPDATE `respondent_assessment_mapping` m
JOIN (
    SELECT CAST(SUBSTRING_INDEX(`path`, '/', -1) AS UNSIGNED) AS mapping_id,
           MAX(`occurred_at`) AS at
    FROM `activity_log`
    WHERE `method` = 'POST'
      AND `path_template` = '/api/portal/assessments/submit/{mappingId}'
      AND `http_status` BETWEEN 200 AND 299
    GROUP BY mapping_id
) s ON s.mapping_id = m.`respondent_assessment_mapping_id`
LEFT JOIN (
    SELECT CAST(SUBSTRING_INDEX(`path`, '/', -1) AS UNSIGNED) AS mapping_id,
           MAX(`occurred_at`) AS at
    FROM `activity_log`
    WHERE `method` = 'POST'
      AND `path_template` IN ('/api/reports/resetAssessment/{respondentAssessmentMappingId}',
                              '/api/portal/assessments/abandon/{mappingId}')
      AND `http_status` BETWEEN 200 AND 299
    GROUP BY mapping_id
) r ON r.mapping_id = m.`respondent_assessment_mapping_id`
SET m.`completed_at` = s.at
WHERE m.`assessment_status` = 'COMPLETED'
  AND m.`completed_at` IS NULL
  AND (r.at IS NULL OR s.at > r.at);

UPDATE `respondent_assessment_mapping` m
JOIN (
    SELECT b.mapping_id, MIN(b.at) AS at
    FROM (
        SELECT CAST(SUBSTRING_INDEX(`path`, '/', -1) AS UNSIGNED) AS mapping_id,
               `occurred_at` AS at
        FROM `activity_log`
        WHERE `method` = 'POST'
          AND `path_template` = '/api/portal/assessments/begin/{mappingId}'
          AND `http_status` BETWEEN 200 AND 299
    ) b
    LEFT JOIN (
        SELECT CAST(SUBSTRING_INDEX(`path`, '/', -1) AS UNSIGNED) AS mapping_id,
               MAX(`occurred_at`) AS at
        FROM `activity_log`
        WHERE `method` = 'POST'
          AND `path_template` IN ('/api/reports/resetAssessment/{respondentAssessmentMappingId}',
                                  '/api/portal/assessments/abandon/{mappingId}')
          AND `http_status` BETWEEN 200 AND 299
        GROUP BY mapping_id
    ) r ON r.mapping_id = b.mapping_id
    WHERE r.at IS NULL OR b.at > r.at
    GROUP BY b.mapping_id
) s ON s.mapping_id = m.`respondent_assessment_mapping_id`
SET m.`started_at` = s.at
WHERE m.`started_at` IS NULL
  AND (m.`assessment_status` = 'ONGOING'
       OR (m.`assessment_status` = 'COMPLETED'
           AND m.`completed_at` IS NOT NULL
           AND s.at <= m.`completed_at`));
