-- 007_published_questionnaires.sql
-- Full-fidelity storage for user-published questionnaires from the Create
-- Questionnaire wizard. Keeps MQs, questions, options, media, and scoring
-- as JSONB so the take-assessment flow can render exactly what the author
-- authored — no schema gymnastics.

CREATE TABLE IF NOT EXISTS published_questionnaires (
    id           VARCHAR(64)  PRIMARY KEY,
    name         VARCHAR(255) NOT NULL UNIQUE,
    short_name   VARCHAR(64),
    vertical     VARCHAR(64),
    category     VARCHAR(255),
    description  TEXT,
    duration     INT,
    tier         VARCHAR(16),
    languages    JSONB        NOT NULL DEFAULT '[]',
    mqs          JSONB        NOT NULL DEFAULT '[]',
    questions    JSONB        NOT NULL DEFAULT '[]',
    is_demo      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pq_name_lower ON published_questionnaires (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_pq_vertical   ON published_questionnaires (LOWER(vertical));

DROP TRIGGER IF EXISTS published_questionnaires_updated_at ON published_questionnaires;
CREATE TRIGGER published_questionnaires_updated_at BEFORE UPDATE ON published_questionnaires
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
