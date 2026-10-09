-- Per-section layout: a section may say how ITS questions are paged in the
-- portal, overriding the assessment's question_layout (V41) for that section
-- only — so one assessment can show a rating battery as one scrollable page
-- and a set of scenarios one question at a time.
--
-- NULL = "use the assessment's setting", and that is every existing row:
-- nothing live changes when this applies, and no backfill is wanted. It is
-- also what a Redis content entry written before this column deserialises
-- the new field as, so a stale cache entry is harmless.
--
-- Same ENUM, same value list and order as assessment.question_layout, because
-- it is the same setting resolved one level down (QuestionLayout). On a
-- section, SECTION_PER_PAGE reads as "this section on one page". New values
-- go at the END of the list in BOTH columns — inserting mid-list renumbers
-- stored rows (see V22).
--
-- Physical column is snake_case: @Column(name = "questionLayout") is a logical
-- name that Hibernate's CamelCaseToUnderscores strategy lowers (see V35).
--
-- Guarded: a plain ADD COLUMN fails with errno 1060 if the column is already
-- there and, MySQL committing DDL implicitly, could not roll back. The probe
-- makes a re-run a no-op.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'section'
      AND COLUMN_NAME  = 'question_layout'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `section`
        ADD COLUMN `question_layout` enum(''ONE_PER_PAGE'',''SECTION_PER_PAGE'') NULL DEFAULT NULL
        AFTER `show_instruction_on_each_question`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
