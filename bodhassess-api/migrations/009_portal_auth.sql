-- 009_portal_auth.sql
-- Server-side session tokens for the respondent portal. Login creates a row;
-- the client holds only the opaque token and verifies via /portal/me.

CREATE TABLE IF NOT EXISTS portal_auth_sessions (
    token          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    respondent_id  VARCHAR(64)  NOT NULL REFERENCES respondents(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_portal_auth_respondent ON portal_auth_sessions (respondent_id);
