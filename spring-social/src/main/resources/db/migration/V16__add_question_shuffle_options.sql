-- Per-question toggle: deliver an MCQ's options in a random order, so two
-- respondents meet the same choices differently.
--
-- NOT NULL DEFAULT 0 with no backfill step: every question authored before
-- this column existed was delivered in the authored order, which is exactly
-- what 0 means. Adding a NOT NULL column onto a populated table is only a
-- trap when the default is wrong for the existing rows; here it is right for
-- all of them.
--
-- The delivered ORDER is deliberately not stored. PortalAssessmentDetailResponse
-- derives it from (respondentAssessmentMappingId, questionId) with a seeded
-- Random, so it is stable across a reload, different per attempt, and still
-- recomputable later — no per-attempt order table, nothing to keep in sync.
--
-- Physical column is snake_case (`shuffle_options`): the entity's
-- @Column(name = "shuffleOptions") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores naming strategy lowercases with underscores — same
-- as `risk_flag` in V1, `show_question_index` in V3 and `selection_rule` in
-- V11. Get this wrong and ddl-auto: validate refuses to boot.
--
-- Guard first: a plain ADD COLUMN would fail with errno 1060 if a prior
-- manual patch already added the column and, because MySQL commits DDL
-- implicitly, could not roll back. The prepared statement below no-ops when
-- the column is already there, so a re-run is safe.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'shuffle_options'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `question` ADD COLUMN `shuffle_options` BIT(1) NOT NULL DEFAULT 0 AFTER `risk_flag`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
