-- How many options a respondent may pick on one question: a rule
-- (MIN / MAX / EQUALS) and the n it applies to.
--
-- BOTH NULLABLE, and always set or cleared together. A question with no rule
-- is single choice — which is what every question meant before this column
-- existed — so every existing row is already correct and there is NO backfill
-- step. That is also why the "add NULL, UPDATE, then MODIFY NOT NULL" rule
-- does not apply here.
--
-- Physical columns are snake_case (`selection_rule`, `selection_count`): the
-- entity's @Column(name = "selectionRule") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores naming strategy lowercases with underscores — same
-- as `content_type` / `risk_flag` in V1 and `show_question_index` in V3. Get
-- this wrong and ddl-auto: validate refuses to boot.
--
-- The enum(...) column type mirrors how `content_type` is already stored, so
-- Hibernate's validator treats it the same way it already treats that column.
--
-- The CHECK is cheap insurance against a half-set pair reaching the table by
-- some path other than QuestionController. Hibernate's validate only inspects
-- tables, columns and types, so it does not trip on it; the H2 test schema is
-- built from the entities and never sees it.
--
-- Guard first: plain ADD COLUMN would fail with errno 1060 if a prior manual
-- patch already added the columns and, because MySQL commits DDL implicitly,
-- could not roll back. Both columns and the constraint are added by ONE
-- statement, so probing for `selection_rule` covers all three.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'selection_rule'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `question`
       ADD COLUMN `selection_rule` enum(''MIN'',''MAX'',''EQUALS'') DEFAULT NULL AFTER `content_type`,
       ADD COLUMN `selection_count` int DEFAULT NULL AFTER `selection_rule`,
       ADD CONSTRAINT `ckQuestionSelection` CHECK (
            (`selection_rule` IS NULL     AND `selection_count` IS NULL)
         OR (`selection_rule` IS NOT NULL AND `selection_count` >= 1))'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
