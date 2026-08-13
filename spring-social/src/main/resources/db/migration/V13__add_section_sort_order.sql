-- Explicit display order for a questionnaire's sections.
--
-- Until now section order WAS insertion order (`ORDER BY section_id`), so an
-- author could never move "Part B" above "Part A" without deleting and
-- recreating both. `sort_order` makes the order editable and, because the
-- report tag letters (Section_A_Q_1) are stamped from section DISPLAY order,
-- it is also what those letters follow from here on.
--
-- Physical column is snake_case (`sort_order`): the entity's
-- @Column(name = "sortOrder") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores strategy lowercases with underscores — same as
-- `sort_order` on questionnaire_question / option in V1. Get this wrong and
-- ddl-auto: validate refuses to boot.
--
-- NOT NULL, so this follows the backfill rule: add it NULLABLE, number the
-- existing rows, and only then tighten. Adding NOT NULL straight onto a
-- populated table would fill every row with 0 and leave every section of a
-- questionnaire tied for first place.
--
-- Guard first: a plain ADD COLUMN fails with errno 1060 if a prior manual
-- patch already added `sort_order` and, because MySQL commits DDL implicitly,
-- could not roll back. All three statements below are guarded by the same
-- probe, so a re-run is a no-op rather than a half-applied mess.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'section'
      AND COLUMN_NAME  = 'sort_order'
);

-- 1 — add it nullable.
SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `section` ADD COLUMN `sort_order` int NULL AFTER `questionnaire_id`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2 — backfill: preserve exactly the order the app displayed until now, which
-- is section_id ascending WITHIN each questionnaire. Numbering is 0-based to
-- match every other sortOrder in this schema (option, questionnaire_question,
-- questionnaire_demographic_field), so nothing has to special-case sections.
SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'UPDATE `section` s
       JOIN (SELECT `section_id`,
                    ROW_NUMBER() OVER (PARTITION BY `questionnaire_id`
                                       ORDER BY `section_id`) - 1 AS `rn`
               FROM `section`) r
         ON r.`section_id` = s.`section_id`
        SET s.`sort_order` = r.`rn`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3 — tighten. Every row is numbered by now, so this cannot invent zeroes.
SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `section` MODIFY COLUMN `sort_order` int NOT NULL'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
