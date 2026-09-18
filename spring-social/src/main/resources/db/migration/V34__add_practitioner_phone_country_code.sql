-- Adds PractitionerUser.phoneCountryCode.
--
-- ── What and why ──────────────────────────────────────────────────────────
-- The twin of V24, one table over. A practitioner's phone becomes two values
-- instead of one, following E.164 exactly as a respondent's has since
-- 2026-08-31: a '+' dial code here, digits-only subscriber number in `phone`,
-- at most 15 digits between them.
--
-- V24 left the staff record behind. Until now `practitioner_user.phone` was
-- free text with NO validation at all — not the loose pattern respondents
-- carried before the split, none — so the record of the people who run the
-- platform was looser than the record of the people who sit its assessments.
-- There was no reason for that beyond the order the two were built in.
--
-- Stored WITH the '+' ("+91"), so the pair concatenates straight into an E.164
-- string with no further knowledge of what either half means. VARCHAR(8)
-- against a validated max of 4 characters — the slack is free and a column
-- widening is not.
--
-- NULLABLE, and there is deliberately NO BACKFILL, for V24's reasons: existing
-- rows hold free text with no stated country, and inferring one from the digits
-- would record a country nobody supplied. The request DTO now REQUIRES both
-- halves, so an old row is brought up to shape when somebody next edits it —
-- and until then PractitionerUser#displayPhone() falls back to the raw column,
-- so it still reads exactly as it did.
--
-- The column therefore cannot be tightened to NOT NULL without a backfill
-- decision first, even though the DTO treats it as mandatory. Same standing
-- trap as respondent_user.phone_country_code.
--
-- Guard first: a plain ADD COLUMN fails with errno 1060 if a prior manual
-- patch already added it, and that failure could not roll back. The prepared
-- statement below no-ops when the column exists, so a re-run is safe.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'practitioner_user'
      AND COLUMN_NAME  = 'phone_country_code'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `practitioner_user` ADD COLUMN `phone_country_code` VARCHAR(8) NULL AFTER `phone`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
