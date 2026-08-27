-- A fourth Gender value: PREFER_NOT_TO_SAY.
--
-- Needed because gender is now a REQUIRED answer on the portal's registration
-- form, on the dashboard's respondent form and in the bulk sheet. "Required"
-- without a way to decline is not a question, it is a demand — so declining
-- becomes an explicit, storable answer.
--
-- NULL and PREFER_NOT_TO_SAY are NOT the same thing and this migration
-- deliberately backfills nothing:
--   NULL               = never asked / predates the requirement
--   PREFER_NOT_TO_SAY  = asked, and they chose not to answer
-- Rewriting the existing NULLs would invent an answer nobody gave.
--
-- Appended to the END of the value list, never inserted alphabetically. MySQL
-- stores an ENUM as the 1-based index of its value, so inserting
-- 'PREFER_NOT_TO_SAY' between 'OTHER' and the end of an alphabetical list
-- would be fine, but inserting anywhere BEFORE an existing value renumbers
-- every row that holds it. Appending is the only change that cannot touch
-- stored data. Four values still fit in one byte, so this is a metadata-only
-- ALTER on MySQL 8.
--
-- Hibernate maps the field @Enumerated(STRING) and ddl-auto is `validate`,
-- which checks the column exists and is a string type — it does not compare
-- the value list — so the entity and this ALTER only have to agree in
-- practice, not for the app to boot. Tests are unaffected: Flyway is disabled
-- there and H2 builds the column from the entity.
--
-- Guard first: MODIFY is idempotent in effect, but re-running it on a table
-- that already has the value is still a full metadata write, and if a prior
-- manual patch used a different value order this would silently reorder it.
-- Skip when the value is already present.
SET @has_value := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'respondent_user'
      AND COLUMN_NAME  = 'gender'
      AND COLUMN_TYPE LIKE '%PREFER_NOT_TO_SAY%'
);

SET @ddl := IF(
    @has_value > 0,
    'SELECT 1',
    'ALTER TABLE `respondent_user` MODIFY `gender` enum(''FEMALE'',''MALE'',''OTHER'',''PREFER_NOT_TO_SAY'') DEFAULT NULL'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
