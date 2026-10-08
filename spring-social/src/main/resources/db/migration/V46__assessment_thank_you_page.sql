-- The portal's thank-you page becomes per-assessment: the author writes the
-- message shown under "Thank you!" and names who respondents can reach
-- (a contact person or the researcher running the study).
--
-- 1. assessment.thank_you_message — the editor's HTML subset, the same rules
--    as terms_and_conditions (RichTextHtml). NULL = the standard wording
--    (AssessmentThankYou.DEFAULT_HTML), which is what every respondent sees
--    today — so no backfill, and nothing live changes when this applies.
-- 2. assessment.contact_name / contact_email — typed, both or neither, both
--    optional. Free text rather than a practitioner FK: the researcher need
--    not have a dashboard login, and an FK would block deleting the
--    practitioner. 254 is the longest address SMTP can carry.
--
-- All three nullable, nothing dropped, no constraint added. Physical names
-- are snake_case (Hibernate lowers @Column(name = "thankYouMessage"); see V35).
--
-- Guarded per column, as V41: a plain ADD COLUMN fails with errno 1060 when
-- the column already exists and, MySQL committing DDL implicitly, could not
-- roll back. Each probe makes a re-run a no-op.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment'
      AND COLUMN_NAME  = 'thank_you_message'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `assessment`
        ADD COLUMN `thank_you_message` text NULL
        AFTER `terms_and_conditions`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment'
      AND COLUMN_NAME  = 'contact_name'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `assessment`
        ADD COLUMN `contact_name` varchar(200) NULL
        AFTER `thank_you_message`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'assessment'
      AND COLUMN_NAME  = 'contact_email'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `assessment`
        ADD COLUMN `contact_email` varchar(254) NULL
        AFTER `contact_name`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
