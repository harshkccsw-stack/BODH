-- Two delivery settings, both defaulting to exactly what every respondent
-- sees today, so nothing live changes when this applies.
--
-- 1. questionnaire_question.is_optional — per PLACEMENT, not per bank
--    question: the same question can be required in one questionnaire and
--    optional in another, the way questionnaire_demographic_field.is_required
--    already works for demographics. An optional question may be left blank
--    at submit; one that IS answered still has to satisfy its selection rule,
--    and an optional grid is all-or-nothing. A skipped scored question scores
--    0 (decided 2026-10-06), which is what the scorer already does with an
--    answer that is not there.
--
--    The polarity is deliberate: DEFAULT 0 = required = today. The portal
--    content is Redis-cached and a cache entry written before this column
--    deserialises the new flag as false — which must mean "required", or
--    every questionnaire would turn all-optional until its entry expired.
--
-- 2. assessment.question_layout — how the portal pages the questions:
--    ONE_PER_PAGE (today) or SECTION_PER_PAGE (a whole section on one
--    scrollable page; a flat questionnaire is then one page). Per
--    ASSESSMENT, beside auto_next and show_question_index, because it is
--    presentation: the same questionnaire can be delivered either way, and
--    assessment settings are read live, so no cache entry depends on it.
--    Appending a value later (N per page) goes at the END of the list —
--    inserting mid-list renumbers stored rows (see V22).
--
-- Physical names are snake_case: @Column(name = "isOptional") and
-- @Column(name = "questionLayout") are logical names that Hibernate's
-- CamelCaseToUnderscores strategy lowers, as V35 explains. NOT NULL needs no
-- backfill — the defaults ARE the correct values for every existing row.
--
-- Guarded per column: a plain ADD COLUMN fails with errno 1060 if the column
-- is already there and, MySQL committing DDL implicitly, could not roll back.
-- Each probe makes a re-run a no-op.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'questionnaire_question'
      AND COLUMN_NAME  = 'is_optional'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `questionnaire_question`
        ADD COLUMN `is_optional` bit(1) NOT NULL DEFAULT b''0''
        AFTER `sort_order`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment'
      AND COLUMN_NAME  = 'question_layout'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `assessment`
        ADD COLUMN `question_layout` enum(''ONE_PER_PAGE'',''SECTION_PER_PAGE'')
            NOT NULL DEFAULT ''ONE_PER_PAGE''
        AFTER `show_question_index`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
