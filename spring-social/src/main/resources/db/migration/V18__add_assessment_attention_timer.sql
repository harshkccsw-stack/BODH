-- Per-assessment toggle for the portal's ATTENTION TIMER.
--
-- With it on, the inactivity ("Focus on your assessment") popup starts a
-- 10-minute budget the first time it appears. The clock only runs WHILE the
-- popup is up — OKAY pauses it, the next popup resumes it from where it
-- stopped — and when the budget is spent the attempt is abandoned: the portal
-- calls /api/portal/assessments/abandon/{mappingId}, the allotment drops back
-- to NOT_STARTED, and the respondent takes it again from the beginning.
--
-- NOT NULL DEFAULT 0 with no backfill step: every assessment authored before
-- this column existed had no timer at all, which is exactly what 0 means.
-- Adding a NOT NULL column onto a populated table is only a trap when the
-- default is wrong for the existing rows; here it is right for all of them.
--
-- Physical column is snake_case (`attention_timer`): the entity's
-- @Column(name = "attentionTimer") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores naming strategy lowercases with underscores — same
-- as `auto_next` in V1, `show_question_index` in V3 and `shuffle_options` in
-- V16. Get this wrong and ddl-auto: validate refuses to boot.
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
      AND COLUMN_NAME  = 'attention_timer'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `assessment` ADD COLUMN `attention_timer` BIT(1) NOT NULL DEFAULT 0 AFTER `show_question_index`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
