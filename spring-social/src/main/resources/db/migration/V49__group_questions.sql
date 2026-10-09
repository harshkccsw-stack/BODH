-- Group Question (2026-10-08, docs/group-question-plan.md): a bank question
-- of type GROUP is an optional heading over member questions that are full
-- Question rows of their own (own options, own MQ/MQT scores) and are
-- DELIVERED together — one page, options laid out horizontally. Members hang
-- off their parent by `parent_question_id` and keep their place with
-- `group_sort_order`; both NULL on every question that exists today, so
-- nothing is backfilled and nothing changes meaning. The parent itself is
-- never placed in a questionnaire and never answered — members carry the
-- placements, the tags and the answers, which is why the answer tables are
-- untouched.
--
-- ENUM append rule (V22): GROUP goes at the END of question_type's value
-- list — inserting mid-list renumbers stored rows. Widening rebuilds the
-- table; `question` is small.
--
-- Guarded like V42/V48: MySQL commits DDL implicitly, so every statement
-- probes information_schema first and a re-run is a no-op.

-- ── 1. question_type gains GROUP, appended ──────────────────────────────────
SET @has_group := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'question_type'
      AND COLUMN_TYPE LIKE '%GROUP%'
);
SET @ddl := IF(
    @has_group > 0,
    'SELECT 1',
    'ALTER TABLE `question`
        MODIFY COLUMN `question_type`
          enum(''MCQ'',''LINEAR_SCALE'',''LIKERT_GRID'',''SHORT_ANSWER'',''PARAGRAPH'',''GAMES'',''GROUP'')
          NOT NULL DEFAULT ''MCQ'''
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 2. The parent pointer ───────────────────────────────────────────────────
-- Physical snake_case for the entity's @JoinColumn(name = "parentQuestionId")
-- (CamelCaseToUnderscores, see V35). NULL = a top-level bank question.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'parent_question_id'
);
SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `question`
        ADD COLUMN `parent_question_id` bigint NULL DEFAULT NULL
        AFTER `question_type`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index first, then the FK (errno 1553 discipline, and the FK then reuses
-- idxQuestionParent instead of minting an anonymous index).
SET @idx_exists := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND INDEX_NAME   = 'idxQuestionParent'
);
SET @ddl := IF(
    @idx_exists > 0,
    'SELECT 1',
    'ALTER TABLE `question` ADD INDEX `idxQuestionParent` (`parent_question_id`)'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- RESTRICT, no cascade: a parent is deleted through the question flow, which
-- removes its members first (scores, then rows) — the composition lives in
-- code like every other one here, and a stray DELETE on the parent must
-- block, not silently take the members with it.
SET @fk_exists := (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA   = DATABASE()
      AND TABLE_NAME     = 'question'
      AND CONSTRAINT_NAME = 'fkQuestionParent'
);
SET @ddl := IF(
    @fk_exists > 0,
    'SELECT 1',
    'ALTER TABLE `question`
        ADD CONSTRAINT `fkQuestionParent`
        FOREIGN KEY (`parent_question_id`) REFERENCES `question` (`question_id`)'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 3. The member's position inside its group ───────────────────────────────
-- NULL exactly when parent_question_id is — a top-level question has no
-- position to hold.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'group_sort_order'
);
SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `question`
        ADD COLUMN `group_sort_order` int NULL DEFAULT NULL
        AFTER `parent_question_id`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
