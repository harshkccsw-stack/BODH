-- 015_practitioner_dob.sql
-- Add an optional date of birth to practitioners.

ALTER TABLE practitioners
    ADD COLUMN IF NOT EXISTS dob DATE;
