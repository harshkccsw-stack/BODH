-- 014_respondent_contact_org.sql
-- Self-registration needs a phone number, and the "organization" account type
-- needs org name + website. All are nullable for backwards compatibility.

ALTER TABLE respondents
    ADD COLUMN IF NOT EXISTS phone        VARCHAR(32),
    ADD COLUMN IF NOT EXISTS account_type VARCHAR(32)  NOT NULL DEFAULT 'individual',
    ADD COLUMN IF NOT EXISTS org_name     VARCHAR(255),
    ADD COLUMN IF NOT EXISTS org_website  VARCHAR(512);
