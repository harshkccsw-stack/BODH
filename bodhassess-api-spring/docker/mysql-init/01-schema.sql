-- BodhAssess MySQL schema (port of Postgres migrations).
-- Postgres-specific features (enums, JSONB, native arrays, advisory locks)
-- have been mapped to MySQL-friendly equivalents:
--   ENUM types       -> VARCHAR with no DB-side check (validation in app)
--   JSONB columns    -> JSON columns
--   text[] arrays    -> JSON arrays
--   uuid PK          -> CHAR(36)
--   pg_advisory_lock -> GET_LOCK / RELEASE_LOCK in service code

CREATE DATABASE IF NOT EXISTS bodhassess
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE bodhassess;

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
    id            CHAR(36)     PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    slug          VARCHAR(100) NOT NULL UNIQUE,
    domain        VARCHAR(255),
    vertical      VARCHAR(32)  NOT NULL DEFAULT 'CLINICAL',
    tier          VARCHAR(8)   NOT NULL DEFAULT 'T1',
    is_whitelabel TINYINT(1)   NOT NULL DEFAULT 0,
    branding      JSON,
    status        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- USERS  (kept because the sessions list query JOINs against it)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id               CHAR(36)     PRIMARY KEY,
    tenant_id        CHAR(36)     NOT NULL,
    email            VARCHAR(255) NOT NULL,
    name             VARCHAR(255) NOT NULL,
    role             VARCHAR(32)  NOT NULL DEFAULT 'PRACTITIONER',
    verticals        JSON,
    primary_language VARCHAR(8)   NOT NULL DEFAULT 'en',
    is_active        TINYINT(1)   NOT NULL DEFAULT 1,
    last_login       TIMESTAMP    NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_users_tenant_email (tenant_id, email),
    INDEX idx_users_email (email),
    INDEX idx_users_role (role),
    CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- ============================================================
-- INSTRUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS instruments (
    id                    CHAR(36)     PRIMARY KEY,
    tenant_id             CHAR(36),
    name                  VARCHAR(255) NOT NULL,
    short_name            VARCHAR(50),
    vertical              VARCHAR(32)  NOT NULL,
    category              VARCHAR(100),
    description           TEXT,
    item_count            INT          NOT NULL DEFAULT 0,
    duration_minutes      INT,
    languages             JSON,
    tier_required         VARCHAR(8)   NOT NULL DEFAULT 'T1',
    is_adaptive           TINYINT(1)   NOT NULL DEFAULT 0,
    is_fixed_sequence     TINYINT(1)   NOT NULL DEFAULT 0,
    norm_status           VARCHAR(50)  NOT NULL DEFAULT 'AVAILABLE',
    age_range             VARCHAR(20),
    informant_types       JSON,
    scoring_algorithm     VARCHAR(50)  NOT NULL DEFAULT 'IRT_3PL',
    metadata              JSON,
    is_published          TINYINT(1)   NOT NULL DEFAULT 1,
    uses_weighted_scoring TINYINT(1)   NOT NULL DEFAULT 0,
    scoring_config        JSON,
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_instruments_vertical (vertical),
    INDEX idx_instruments_tier (tier_required),
    CONSTRAINT fk_instruments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- ============================================================
-- ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
    id                 CHAR(36)     PRIMARY KEY,
    instrument_id      CHAR(36)     NOT NULL,
    vertical           VARCHAR(32)  NOT NULL,
    sub_domain         VARCHAR(100),
    sub_domains        JSON,
    item_format        VARCHAR(32)  NOT NULL DEFAULT 'MCQ',
    stem               TEXT         NOT NULL,
    media_url          TEXT,
    media_type         VARCHAR(20),
    options            JSON,
    irt_a              DOUBLE,
    irt_b              DOUBLE,
    irt_c              DOUBLE       NOT NULL DEFAULT 0,
    languages          JSON,
    norm_group         JSON,
    validation_status  VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
    clinical_risk_flag TINYINT(1)   NOT NULL DEFAULT 0,
    risk_flag_rule     TEXT,
    sequence_order     INT,
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_items_instrument (instrument_id),
    INDEX idx_items_vertical (vertical, sub_domain, validation_status),
    CONSTRAINT fk_items_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id)
);

-- ============================================================
-- SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
    id                  CHAR(36)    PRIMARY KEY,
    tenant_id           CHAR(36)    NOT NULL,
    practitioner_id     CHAR(36)    NOT NULL,
    respondent_id       CHAR(36)    NOT NULL,
    instrument_id       CHAR(36)    NOT NULL,
    consent_id          CHAR(36),
    vertical            VARCHAR(32) NOT NULL,
    language            VARCHAR(8)  NOT NULL DEFAULT 'en',
    status              VARCHAR(20) NOT NULL DEFAULT 'CREATED',
    is_proctored        TINYINT(1)  NOT NULL DEFAULT 0,
    proctor_status      VARCHAR(20),
    trust_score         DOUBLE,
    current_item_index  INT         NOT NULL DEFAULT 0,
    theta_estimate      DOUBLE      NOT NULL DEFAULT 0,
    theta_sem           DOUBLE,
    started_at          TIMESTAMP   NULL,
    completed_at        TIMESTAMP   NULL,
    time_limit_minutes  INT,
    last_auto_save      TIMESTAMP   NULL,
    invitation_sent_at  TIMESTAMP   NULL,
    invitation_method   VARCHAR(20),
    metadata            JSON,
    created_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sessions_tenant (tenant_id),
    INDEX idx_sessions_practitioner (practitioner_id),
    INDEX idx_sessions_respondent (respondent_id),
    INDEX idx_sessions_status (status),
    INDEX idx_sessions_vertical (vertical),
    CONSTRAINT fk_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    CONSTRAINT fk_sessions_instrument FOREIGN KEY (instrument_id) REFERENCES instruments(id)
);

-- ============================================================
-- MEASURED QUALITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS measured_qualities (
    id          VARCHAR(64)  PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    mqts        JSON         NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- VERTICALS  (user-defined verticals; built-ins are implicit)
-- ============================================================
CREATE TABLE IF NOT EXISTS verticals (
    id          VARCHAR(64)  PRIMARY KEY,
    code        VARCHAR(64)  NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_verticals_code (code)
);

-- ============================================================
-- ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
    id          VARCHAR(64)  PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    url_paths   JSON         NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_roles_name (name)
);

-- ============================================================
-- RESPONDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS respondents (
    id              VARCHAR(64)  PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    phone           VARCHAR(64),
    dob             VARCHAR(16),
    consent         VARCHAR(32)  NOT NULL DEFAULT 'Pending',
    sessions_count  INT          NOT NULL DEFAULT 0,
    last_assessment VARCHAR(255),
    account_type    VARCHAR(32)  NOT NULL DEFAULT 'individual',
    org_name        VARCHAR(255),
    org_website     VARCHAR(512),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- PRACTITIONERS
-- ============================================================
CREATE TABLE IF NOT EXISTS practitioners (
    id         VARCHAR(64)  PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255) NOT NULL UNIQUE,
    roles      JSON         NOT NULL,
    verticals  JSON         NOT NULL,
    status     VARCHAR(32)  NOT NULL DEFAULT 'Active',
    last_login VARCHAR(32),
    dob        DATE,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- RESPONDENT GROUPS
-- ============================================================
CREATE TABLE IF NOT EXISTS respondent_groups (
    id                    VARCHAR(64)  PRIMARY KEY,
    name                  VARCHAR(255) NOT NULL,
    description           TEXT,
    parent_id             VARCHAR(64),
    member_ids            JSON         NOT NULL,
    assigned_instruments  JSON         NOT NULL,
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_groups_parent (parent_id),
    CONSTRAINT fk_groups_parent FOREIGN KEY (parent_id)
        REFERENCES respondent_groups(id) ON DELETE CASCADE
);

-- ============================================================
-- PORTAL SESSIONS  (assessments visible in the dashboard)
-- ============================================================
CREATE TABLE IF NOT EXISTS portal_sessions (
    id                   VARCHAR(64)  PRIMARY KEY,
    name                 VARCHAR(255),
    respondent_id        VARCHAR(64)  NOT NULL,
    respondent_name      VARCHAR(255) NOT NULL,
    respondent_email     VARCHAR(255),
    instrument           VARCHAR(255) NOT NULL,
    instrument_full_name VARCHAR(255),
    vertical             VARCHAR(64),
    language             VARCHAR(64)  NOT NULL DEFAULT 'English',
    status               VARCHAR(32)  NOT NULL DEFAULT 'Active',
    score                VARCHAR(255),
    answers              JSON,
    mqt_scores           JSON,
    demographics         JSON,
    group_id             VARCHAR(64),
    group_name           VARCHAR(255),
    consent_id           VARCHAR(64),
    proctoring           TINYINT(1)   NOT NULL DEFAULT 0,
    invitation_sent      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at         TIMESTAMP    NULL,
    INDEX idx_portal_sessions_respondent (respondent_id),
    INDEX idx_portal_sessions_status (status)
);

-- ============================================================
-- PUBLISHED QUESTIONNAIRES
-- ============================================================
CREATE TABLE IF NOT EXISTS published_questionnaires (
    id                     VARCHAR(64)  PRIMARY KEY,
    name                   VARCHAR(255) NOT NULL,
    short_name             VARCHAR(255),
    vertical               VARCHAR(64),
    category               VARCHAR(255),
    description            TEXT,
    duration               INT,
    tier                   VARCHAR(32),
    languages              JSON         NOT NULL,
    mqs                    JSON,
    questions              JSON,
    is_demo                TINYINT(1)   NOT NULL DEFAULT 0,
    disclaimer             TEXT,
    demographic_field_keys JSON         NOT NULL,
    created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pq_name (name),
    INDEX idx_pq_short_name (short_name)
);

-- ============================================================
-- ITEM DISPLAY STATE
-- ============================================================
CREATE TABLE IF NOT EXISTS item_display_state (
    item_id  VARCHAR(64) PRIMARY KEY,
    override JSON,
    deleted  TINYINT(1)  NOT NULL DEFAULT 0
);

-- ============================================================
-- DEMOGRAPHIC FIELDS
-- ============================================================
CREATE TABLE IF NOT EXISTS demographic_fields (
    id          VARCHAR(64)  PRIMARY KEY,
    field_key   VARCHAR(128) NOT NULL,
    label       VARCHAR(255) NOT NULL,
    type        VARCHAR(32)  NOT NULL,
    required    TINYINT(1)   NOT NULL DEFAULT 0,
    placeholder VARCHAR(255),
    options     JSON,
    sort_order  INT          NOT NULL DEFAULT 0,
    active      TINYINT(1)   NOT NULL DEFAULT 1
);
