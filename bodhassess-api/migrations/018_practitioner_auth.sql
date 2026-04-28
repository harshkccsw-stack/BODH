-- 018_practitioner_auth.sql
-- Server-side session tokens for the practitioner dashboard. Login (name +
-- DOB) creates a row; the client holds only the opaque token and verifies via
-- /practitioners/me. Mirrors portal_auth_sessions for respondents.

CREATE TABLE IF NOT EXISTS practitioner_auth_sessions (
    token             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    practitioner_id   VARCHAR(64)  NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at        TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_practitioner_auth_practitioner ON practitioner_auth_sessions (practitioner_id);
