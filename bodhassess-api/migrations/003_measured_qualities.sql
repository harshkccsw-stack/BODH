-- 003_measured_qualities.sql
-- Measured Qualities (MQs) and their Measured Quality Types (MQTs) are now
-- first-class, catalog-level entities — managed on /qualities in the UI and
-- picked by Create Assessment per-instrument.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS measured_qualities (
    id           VARCHAR(64)   PRIMARY KEY,
    name         VARCHAR(255)  NOT NULL UNIQUE,
    description  TEXT,
    mqts         JSONB         NOT NULL DEFAULT '[]'::jsonb,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_measured_qualities_name_lower
    ON measured_qualities (LOWER(name));

-- Trigger: keep updated_at in sync.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS measured_qualities_updated_at ON measured_qualities;
CREATE TRIGGER measured_qualities_updated_at
    BEFORE UPDATE ON measured_qualities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
