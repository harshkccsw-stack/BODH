-- Adds RespondentUser.phoneCountryCode.
--
-- ── What and why ──────────────────────────────────────────────────────────
-- A respondent's phone becomes two values instead of one.
--
-- Until now `phone` was a single free-text column checked by one loose pattern,
-- on the reasoning that a form filled in from every country cannot know what a
-- number should look like. That reasoning was correct, and this column is what
-- removes it: the pair now follows E.164, the ITU standard for international
-- numbers — a '+' dial code here, digits-only subscriber number in `phone`, at
-- most 15 digits between them.
--
-- Stored WITH the '+' ("+91"), so the pair concatenates straight into an E.164
-- string with no further knowledge of what either half means. VARCHAR(8) against a
-- validated max of 4 characters — the slack is free and a column widening is
-- not.
--
-- NULLABLE, and there is deliberately NO BACKFILL. Every respondent written
-- before today has free text in `phone` — often already carrying its own
-- "+91 " — and no stated country. Inferring one from the digits would record a
-- country nobody supplied, on the row that decides where a person is
-- contacted. Those rows keep exactly what they have; they are brought up to
-- the new shape only when someone edits them, at which point the form requires
-- both halves. Reports join the two with RespondentUser#displayPhone(), which
-- falls back to the raw column when there is no code, so an old row still
-- displays exactly as it did before.
--
-- This also means the column can never be tightened to NOT NULL without a
-- backfill decision first — see CLAUDE.md's "backfill before tightening".
--
-- Guard first: a plain ADD COLUMN fails with errno 1060 if a prior manual
-- patch already added it, and that failure could not roll back. The prepared
-- statement below no-ops when the column exists, so a re-run is safe.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'respondent_user'
      AND COLUMN_NAME  = 'phone_country_code'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `respondent_user` ADD COLUMN `phone_country_code` VARCHAR(8) NULL AFTER `phone`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
