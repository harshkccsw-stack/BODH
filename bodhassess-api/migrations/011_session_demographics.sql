-- 011_session_demographics.sql
-- Per-session demographic snapshot collected from the respondent right before
-- they start the assessment. One-time form — captured with the session so
-- reports + analytics can slice by demographics without digging into the
-- respondent record.

ALTER TABLE portal_sessions
    ADD COLUMN IF NOT EXISTS demographics JSONB;
