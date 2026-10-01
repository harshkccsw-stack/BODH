-- Demographic CHECKLIST type and the write-in "Other" choice (2026-10-01).
-- Plan: docs/demographic-other-and-checklist-plan.md
--
-- CHECKLIST is a demographic field the respondent may tick ANY number of
-- options on. Its options live in demographic_field_option exactly like a
-- DROPDOWN's. Each tick is its OWN demographic_response row — no JSON, no new
-- table.
--
-- The write-in "Other" is NOT a row in demographic_field_option: it is
-- `demographic_field.other_option_label`, NULL = the field has none, always
-- delivered LAST. Picking it requires text, which lands in
-- `demographic_response.other_text` on that one row.
--
-- The unique key is what makes one row per tick safe. `option_value` is ''
-- on every non-checklist row (the DEFAULT, so a writer that knows nothing of
-- checklists still gets it) and the ticked option on a checklist row, so the
-- key (respondent, assessment, field, option_value) still allows exactly ONE
-- row per Text/Number/Date/Dropdown answer — as the old key did — and one row
-- per distinct tick. '' and not NULL: MySQL never treats two NULLs as equal,
-- so a NULL would let a second Gender row through. utf8mb4_bin so the key
-- compares exactly: under the table's ai_ci collation "Cafe" and "Café" are
-- the same key and ticking both would fail at commit.
--
-- Guarded (V17/V36 pattern): MySQL commits DDL implicitly, so every step is a
-- no-op on re-run rather than a failure with no way back. Every existing row
-- satisfies the new key — it gets '' and the old key already held — so the
-- key swap cannot fail on current data.

-- ── 1. The new field type ────────────────────────────────────────────────
-- APPENDED to the member list: inserting mid-list renumbers stored rows.
SET @has_checklist := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'demographic_field'
      AND COLUMN_NAME  = 'field_type'
      AND COLUMN_TYPE LIKE '%CHECKLIST%'
);
SET @ddl := IF(@has_checklist > 0, 'SELECT 1',
  'ALTER TABLE `demographic_field`
     MODIFY COLUMN `field_type`
       enum(''DATE'',''DROPDOWN'',''NUMBER'',''TEXT'',''CHECKLIST'') NOT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. The write-in label on the field ───────────────────────────────────
SET @has_other_label := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'demographic_field'
      AND COLUMN_NAME  = 'other_option_label'
);
SET @ddl := IF(@has_other_label > 0, 'SELECT 1',
  'ALTER TABLE `demographic_field` ADD COLUMN `other_option_label` VARCHAR(255) NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. What they typed, on the answer row ────────────────────────────────
-- VARCHAR(255) so the database holds the same cap the service enforces.
SET @has_other_text := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'demographic_response'
      AND COLUMN_NAME  = 'other_text'
);
SET @ddl := IF(@has_other_text > 0, 'SELECT 1',
  'ALTER TABLE `demographic_response` ADD COLUMN `other_text` VARCHAR(255) NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 4. Which tick a row is ('' when the field is not a checklist) ────────
SET @has_option_value := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'demographic_response'
      AND COLUMN_NAME  = 'option_value'
);
SET @ddl := IF(@has_option_value > 0, 'SELECT 1',
  'ALTER TABLE `demographic_response`
     ADD COLUMN `option_value` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
       NOT NULL DEFAULT ''''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 5. The unique key, widened by option_value ───────────────────────────
-- The OLD key is the only index starting with respondent_user_id, so
-- fkDrRespondent depends on it: the new key goes in BEFORE the old one comes
-- out, or errno 1553.
SET @new_key := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'demographic_response'
      AND INDEX_NAME   = 'uqDrRespondentAssessmentFieldOption'
);
SET @ddl := IF(@new_key > 0, 'SELECT 1',
  'ALTER TABLE `demographic_response`
     ADD UNIQUE KEY `uqDrRespondentAssessmentFieldOption`
       (`respondent_user_id`,`assessment_id`,`demographic_field_id`,`option_value`)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @old_key := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'demographic_response'
      AND INDEX_NAME   = 'uqDrRespondentAssessmentField'
);
SET @ddl := IF(@old_key = 0, 'SELECT 1',
  'ALTER TABLE `demographic_response` DROP INDEX `uqDrRespondentAssessmentField`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
