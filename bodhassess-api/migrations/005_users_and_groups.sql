-- 005_users_and_groups.sql
-- Respondents, Practitioners, and Respondent Groups (with self-referencing
-- parent for nested subgroups). Member lists kept as JSONB for simplicity.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS respondents (
    id               VARCHAR(64)  PRIMARY KEY,
    name             VARCHAR(255) NOT NULL,
    email            VARCHAR(255) NOT NULL UNIQUE,
    dob              VARCHAR(16),
    consent          VARCHAR(32)  NOT NULL DEFAULT 'Pending',
    sessions_count   INT          NOT NULL DEFAULT 0,
    last_assessment  VARCHAR(255),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_respondents_email ON respondents (LOWER(email));

DROP TRIGGER IF EXISTS respondents_updated_at ON respondents;
CREATE TRIGGER respondents_updated_at BEFORE UPDATE ON respondents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS practitioners (
    id          VARCHAR(64)  PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) NOT NULL UNIQUE,
    role        VARCHAR(128) NOT NULL DEFAULT 'Practitioner',
    verticals   JSONB        NOT NULL DEFAULT '[]',
    status      VARCHAR(32)  NOT NULL DEFAULT 'Active',
    last_login  VARCHAR(32),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_practitioners_email ON practitioners (LOWER(email));

DROP TRIGGER IF EXISTS practitioners_updated_at ON practitioners;
CREATE TRIGGER practitioners_updated_at BEFORE UPDATE ON practitioners
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE TABLE IF NOT EXISTS respondent_groups (
    id                    VARCHAR(64)  PRIMARY KEY,
    name                  VARCHAR(255) NOT NULL,
    description           TEXT,
    parent_id             VARCHAR(64)  REFERENCES respondent_groups(id) ON DELETE CASCADE,
    member_ids            JSONB        NOT NULL DEFAULT '[]',
    assigned_instruments  JSONB        NOT NULL DEFAULT '[]',
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_groups_parent ON respondent_groups (parent_id);

DROP TRIGGER IF EXISTS respondent_groups_updated_at ON respondent_groups;
CREATE TRIGGER respondent_groups_updated_at BEFORE UPDATE ON respondent_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
