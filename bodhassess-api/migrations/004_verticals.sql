-- 004_verticals.sql
-- User-created verticals. Built-in verticals (CLINICAL / INDUSTRIAL /
-- COUNSELLING / EXPERIMENTS) are implicit on the frontend and do not
-- live here; only custom entries are persisted.

CREATE TABLE IF NOT EXISTS verticals (
    id           VARCHAR(64)   PRIMARY KEY,
    code         VARCHAR(64)   NOT NULL UNIQUE,
    name         VARCHAR(255)  NOT NULL,
    description  TEXT,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verticals_code ON verticals (code);

DROP TRIGGER IF EXISTS verticals_updated_at ON verticals;
CREATE TRIGGER verticals_updated_at
    BEFORE UPDATE ON verticals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
