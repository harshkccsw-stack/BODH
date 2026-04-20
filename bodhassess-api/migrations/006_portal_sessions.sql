-- 006_portal_sessions.sql
-- Simplified sessions table matching the frontend/portal shape: one row per
-- (respondent, instrument) session, with status + score + answers + MQT totals.

CREATE TABLE IF NOT EXISTS portal_sessions (
    id                   VARCHAR(64)  PRIMARY KEY,
    respondent_id        VARCHAR(64)  NOT NULL,
    respondent_name      VARCHAR(255) NOT NULL,
    respondent_email     VARCHAR(255),
    instrument           VARCHAR(255) NOT NULL,
    instrument_full_name VARCHAR(255),
    vertical             VARCHAR(64),
    language             VARCHAR(64)  NOT NULL DEFAULT 'English',
    status               VARCHAR(32)  NOT NULL DEFAULT 'Active',
    score                VARCHAR(255),
    answers              JSONB,
    mqt_scores           JSONB,
    group_id             VARCHAR(64),
    group_name           VARCHAR(255),
    consent_id           VARCHAR(64),
    proctoring           BOOLEAN      NOT NULL DEFAULT FALSE,
    invitation_sent      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_respondent ON portal_sessions (respondent_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_status     ON portal_sessions (status);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_vertical   ON portal_sessions (LOWER(vertical));

DROP TRIGGER IF EXISTS portal_sessions_updated_at ON portal_sessions;
CREATE TRIGGER portal_sessions_updated_at BEFORE UPDATE ON portal_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
