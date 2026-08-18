-- Per-assessment toggle for PARTIAL-ANSWER SAVING in the portal.
--
-- With it on, the take flow snapshots the respondent's marked answers into
-- Redis as they move between sections (and every few questions on a
-- sectionless paper), so an ONGOING attempt resumed from the dashboard can
-- backfill everything answered so far instead of starting from question 1.
-- The snapshots live only in Redis (1-day TTL) — nothing here changes the
-- answer tables; MySQL still only ever sees the final submission.
--
-- NOT NULL DEFAULT 0 with no backfill step: every assessment authored before
-- this column existed had no partial saving, which is exactly what 0 means
-- (same reasoning as V18's attention_timer).
--
-- Physical column is snake_case (`save_partial_answers`): the entity's
-- @Column(name = "savePartialAnswers") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores naming strategy lowercases with underscores — same
-- as `attention_timer` in V18. Get this wrong and ddl-auto: validate refuses
-- to boot.
--
-- Guard first: a plain ADD COLUMN would fail with errno 1060 if a prior
-- manual patch already added the column and, because MySQL commits DDL
-- implicitly, could not roll back. The prepared statement below no-ops when
-- the column is already there, so a re-run is safe.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment'
      AND COLUMN_NAME  = 'save_partial_answers'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `assessment` ADD COLUMN `save_partial_answers` BIT(1) NOT NULL DEFAULT 0 AFTER `attention_timer`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
