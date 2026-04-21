-- 013_portal_session_name.sql
-- Add an optional display name to portal_sessions so practitioners can label
-- each assessment (e.g., "Q1 Screening", "Post-treatment follow-up").

ALTER TABLE portal_sessions
    ADD COLUMN IF NOT EXISTS name VARCHAR(255);
