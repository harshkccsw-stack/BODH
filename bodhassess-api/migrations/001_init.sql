-- BodhAssess Phase 1 Schema
-- Based on ER Diagram + SRS v1.0

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE vertical_type AS ENUM ('CLINICAL', 'INDUSTRIAL', 'COUNSELLING', 'EXPERIMENTS', 'WHITELABEL');
CREATE TYPE user_role AS ENUM ('PLATFORM_ADMIN', 'TENANT_ADMIN', 'SENIOR_PRACTITIONER', 'PRACTITIONER', 'BODHLENS_VIEWER', 'RESPONDENT', 'BPAAS_CLIENT');
CREATE TYPE tier_level AS ENUM ('T1', 'T2', 'T3', 'T4', 'T5');
CREATE TYPE session_status AS ENUM ('CREATED', 'INVITED', 'IN_PROGRESS', 'COMPLETED', 'TIMED_OUT', 'ABANDONED');
CREATE TYPE report_status AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'FINALIZED');
CREATE TYPE consent_type AS ENUM ('ASSESSMENT', 'DATA_STORAGE', 'RESEARCH');
CREATE TYPE consent_status AS ENUM ('PENDING', 'GRANTED', 'WITHDRAWN');
CREATE TYPE item_format AS ENUM ('MCQ', 'RATING_SCALE', 'MATRIX', 'LIKERT', 'SJT', 'FREE_TEXT', 'AUDIO', 'IMAGE_CHOICE', 'RANKING');
CREATE TYPE validation_status AS ENUM ('DRAFT', 'PILOTING', 'CALIBRATED', 'VALIDATED', 'DEPRECATED');
CREATE TYPE language_code AS ENUM ('en', 'hi', 'ta', 'te', 'mr', 'kn', 'bn', 'gu', 'ml', 'or', 'pa');
CREATE TYPE proctor_status AS ENUM ('APPROVED', 'FLAGGED', 'UNDER_REVIEW');
CREATE TYPE erasure_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'RETAINED_LEGAL');

-- ============================================================
-- TENANTS (Multi-tenant core)
-- ============================================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    domain VARCHAR(255),
    vertical vertical_type NOT NULL DEFAULT 'CLINICAL',
    tier tier_level NOT NULL DEFAULT 'T1',
    is_whitelabel BOOLEAN DEFAULT FALSE,
    branding JSONB DEFAULT '{}',
    keycloak_realm VARCHAR(100),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row-Level Security
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'PRACTITIONER',
    verticals vertical_type[] DEFAULT '{}',
    keycloak_id VARCHAR(255),
    date_of_birth DATE,
    primary_language language_code DEFAULT 'en',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- INSTRUMENTS
-- ============================================================

CREATE TABLE instruments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id), -- NULL = platform-level instrument
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50),
    vertical vertical_type NOT NULL,
    category VARCHAR(100),
    description TEXT,
    item_count INTEGER DEFAULT 0,
    duration_minutes INTEGER,
    languages language_code[] DEFAULT '{en}',
    tier_required tier_level DEFAULT 'T1',
    is_adaptive BOOLEAN DEFAULT FALSE,
    is_fixed_sequence BOOLEAN DEFAULT FALSE,
    norm_status VARCHAR(50) DEFAULT 'AVAILABLE',
    age_range VARCHAR(20),
    informant_types TEXT[] DEFAULT '{}',
    scoring_algorithm VARCHAR(50) DEFAULT 'IRT_3PL',
    metadata JSONB DEFAULT '{}',
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_instruments_vertical ON instruments(vertical);
CREATE INDEX idx_instruments_tier ON instruments(tier_required);

-- ============================================================
-- ITEM BANK
-- ============================================================

CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instrument_id UUID NOT NULL REFERENCES instruments(id),
    vertical vertical_type NOT NULL,
    sub_domain VARCHAR(100),
    item_format item_format NOT NULL DEFAULT 'MCQ',
    stem TEXT NOT NULL,
    options JSONB, -- [{text, value, is_correct}]
    irt_a FLOAT, -- discrimination
    irt_b FLOAT, -- difficulty
    irt_c FLOAT DEFAULT 0, -- pseudo-guessing
    languages language_code[] DEFAULT '{en}',
    norm_group JSONB DEFAULT '{}',
    validation_status validation_status DEFAULT 'DRAFT',
    clinical_risk_flag BOOLEAN DEFAULT FALSE,
    risk_flag_rule TEXT,
    sequence_order INTEGER,
    author_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_items_instrument ON items(instrument_id);
CREATE INDEX idx_items_vertical ON items(vertical, sub_domain, validation_status, irt_b);
CREATE INDEX idx_items_risk ON items(clinical_risk_flag) WHERE clinical_risk_flag = TRUE;

-- ============================================================
-- CONSENT RECORDS (DPDP)
-- ============================================================

CREATE TABLE consent_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    respondent_id UUID NOT NULL REFERENCES users(id),
    consent_type consent_type NOT NULL,
    purpose TEXT NOT NULL,
    status consent_status DEFAULT 'PENDING',
    granted_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    method VARCHAR(50), -- 'whatsapp', 'email', 'in_person'
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_consent_respondent ON consent_records(respondent_id);
CREATE INDEX idx_consent_tenant ON consent_records(tenant_id);

-- ============================================================
-- ASSESSMENT SESSIONS
-- ============================================================

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    practitioner_id UUID NOT NULL REFERENCES users(id),
    respondent_id UUID NOT NULL REFERENCES users(id),
    instrument_id UUID NOT NULL REFERENCES instruments(id),
    consent_id UUID NOT NULL REFERENCES consent_records(id),
    vertical vertical_type NOT NULL,
    language language_code DEFAULT 'en',
    status session_status DEFAULT 'CREATED',
    is_proctored BOOLEAN DEFAULT FALSE,
    proctor_status proctor_status,
    trust_score FLOAT,
    current_item_index INTEGER DEFAULT 0,
    theta_estimate FLOAT DEFAULT 0, -- IRT theta
    theta_sem FLOAT, -- Standard Error of Measurement
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    time_limit_minutes INTEGER,
    last_auto_save TIMESTAMPTZ,
    invitation_sent_at TIMESTAMPTZ,
    invitation_method VARCHAR(20), -- 'email', 'whatsapp', 'sms', 'link'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX idx_sessions_practitioner ON sessions(practitioner_id);
CREATE INDEX idx_sessions_respondent ON sessions(respondent_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_vertical ON sessions(vertical);

-- ============================================================
-- ITEM RESPONSES
-- ============================================================

CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id),
    item_id UUID NOT NULL REFERENCES items(id),
    response_value JSONB NOT NULL, -- {selected_option, raw_text, rt_ms}
    score FLOAT,
    response_time_ms INTEGER,
    theta_after FLOAT, -- theta estimate after this response
    sem_after FLOAT,
    item_sequence INTEGER,
    is_risk_flagged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_responses_session ON responses(session_id);
CREATE INDEX idx_responses_item ON responses(item_id);
CREATE INDEX idx_responses_risk ON responses(is_risk_flagged) WHERE is_risk_flagged = TRUE;

-- ============================================================
-- REPORTS
-- ============================================================

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    session_id UUID NOT NULL REFERENCES sessions(id),
    vertical vertical_type NOT NULL,
    report_type VARCHAR(50) DEFAULT 'STANDARD', -- STANDARD, CLINICAL, INDUSTRIAL, COUNSELLING
    status report_status DEFAULT 'DRAFT',
    scores JSONB NOT NULL DEFAULT '{}', -- {raw, t_score, percentile, subscales}
    norm_group VARCHAR(100),
    diagnostic_codes TEXT[], -- ICD-10, DSM-5 codes
    risk_indicators JSONB DEFAULT '{}',
    narrative_sections JSONB DEFAULT '{}', -- AI-generated text
    pdf_path VARCHAR(500),
    pdf_download_token VARCHAR(255),
    pdf_expires_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    finalized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_reports_session ON reports(session_id);
CREATE INDEX idx_reports_tenant ON reports(tenant_id);
CREATE INDEX idx_reports_status ON reports(status);

-- ============================================================
-- PROCTORING EVENTS
-- ============================================================

CREATE TABLE proctoring_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id),
    event_type VARCHAR(50) NOT NULL, -- 'face_not_detected', 'multiple_faces', 'gaze_away', 'tab_switch', 'browser_exit'
    severity VARCHAR(10) DEFAULT 'LOW', -- LOW, MEDIUM, HIGH, CRITICAL
    details JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proctor_session ON proctoring_events(session_id);

-- ============================================================
-- NORM TABLES
-- ============================================================

CREATE TABLE norm_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instrument_id UUID NOT NULL REFERENCES instruments(id),
    population VARCHAR(100) NOT NULL, -- 'Indian Adult', 'Indian Adolescent 14-18'
    demographics JSONB DEFAULT '{}', -- {age_range, gender, education, sector}
    sample_size INTEGER,
    data_collected_range VARCHAR(50),
    norms JSONB NOT NULL, -- [{raw_score, t_score, percentile, severity, ci_lower, ci_upper}]
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_norms_instrument ON norm_tables(instrument_id);

-- ============================================================
-- AUDIT LOG (DPDP)
-- ============================================================

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- ============================================================
-- ERASURE REQUESTS (DPDP)
-- ============================================================

CREATE TABLE erasure_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    respondent_id UUID NOT NULL REFERENCES users(id),
    reason TEXT,
    status erasure_status DEFAULT 'PENDING',
    filed_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    retention_reason TEXT -- e.g., 'Mental Healthcare Act 2017 — 7 year retention'
);

-- ============================================================
-- SURVEYS (BodhSurvey)
-- ============================================================

CREATE TABLE surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_by UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    questions JSONB NOT NULL DEFAULT '[]',
    languages language_code[] DEFAULT '{en}',
    delivery_methods TEXT[] DEFAULT '{email}', -- 'whatsapp', 'sms', 'email', 'qr', 'link'
    status VARCHAR(20) DEFAULT 'DRAFT',
    response_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEED DATA: Default tenant + admin
-- ============================================================

INSERT INTO tenants (id, name, slug, vertical, tier, status) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Bodh Psychometric Solutions', 'bodh', 'CLINICAL', 'T5', 'ACTIVE');

INSERT INTO users (id, tenant_id, email, name, role, verticals) VALUES
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'admin@bodh.io', 'Platform Admin', 'PLATFORM_ADMIN', '{CLINICAL,INDUSTRIAL,COUNSELLING,EXPERIMENTS}');

-- Seed instruments (Clinical)
INSERT INTO instruments (tenant_id, name, short_name, vertical, category, item_count, duration_minutes, languages, tier_required, is_fixed_sequence, norm_status) VALUES
    (NULL, 'Patient Health Questionnaire-9', 'PHQ-9', 'CLINICAL', 'Depression Screening', 9, 5, '{en,hi,ta,te,mr,bn,gu}', 'T1', TRUE, 'AVAILABLE'),
    (NULL, 'Generalized Anxiety Disorder-7', 'GAD-7', 'CLINICAL', 'Anxiety Screening', 7, 5, '{en,hi,ta,te,mr,bn}', 'T1', TRUE, 'AVAILABLE'),
    (NULL, 'Depression Anxiety Stress Scales-21', 'DASS-21', 'CLINICAL', 'Depression/Anxiety/Stress', 21, 10, '{en,hi}', 'T1', TRUE, 'AVAILABLE'),
    (NULL, 'Beck Depression Inventory-II', 'BDI-II', 'CLINICAL', 'Depression Severity', 21, 10, '{en,hi}', 'T1', TRUE, 'AVAILABLE'),
    (NULL, 'PTSD Checklist for DSM-5', 'PCL-5', 'CLINICAL', 'PTSD Screening', 20, 10, '{en,hi,ta}', 'T1', TRUE, 'AVAILABLE'),
    (NULL, 'Alcohol Use Disorders Identification Test', 'AUDIT', 'CLINICAL', 'Alcohol Use', 10, 5, '{en,hi}', 'T1', TRUE, 'AVAILABLE');

-- Seed instruments (Industrial)
INSERT INTO instruments (tenant_id, name, short_name, vertical, category, item_count, duration_minutes, languages, tier_required, is_adaptive, norm_status) VALUES
    (NULL, 'Big Five Personality (IPIP-NEO-120)', 'Big Five', 'INDUSTRIAL', 'Personality', 120, 25, '{en,hi,ta,te,mr,kn}', 'T1', FALSE, 'AVAILABLE'),
    (NULL, 'HEXACO Personality Inventory', 'HEXACO', 'INDUSTRIAL', 'Personality', 100, 20, '{en,hi}', 'T1', FALSE, 'AVAILABLE'),
    (NULL, 'Learning Agility Assessment', 'LAS', 'INDUSTRIAL', 'Development', 80, 18, '{en,hi,ta,te}', 'T2', TRUE, 'AVAILABLE'),
    (NULL, 'Cognitive Aptitude Battery', 'CAB', 'INDUSTRIAL', 'Aptitude', 60, 35, '{en,hi,ta,te,mr}', 'T1', TRUE, 'AVAILABLE'),
    (NULL, 'AI Adaptability Index', 'AAI', 'INDUSTRIAL', 'AI Readiness', 56, 20, '{en,hi}', 'T3', FALSE, 'IN_PROGRESS');

-- Seed instruments (Counselling)
INSERT INTO instruments (tenant_id, name, short_name, vertical, category, item_count, duration_minutes, languages, tier_required, is_fixed_sequence, norm_status, age_range, informant_types) VALUES
    (NULL, 'Spence Children''s Anxiety Scale', 'SCAS', 'COUNSELLING', 'Anxiety Screening', 45, 15, '{en,hi,ta,te,mr}', 'T1', TRUE, 'AVAILABLE', '6-18', '{Self,Parent}'),
    (NULL, 'Children''s Depression Inventory-2', 'CDI-2', 'COUNSELLING', 'Depression Screening', 28, 12, '{en,hi}', 'T1', TRUE, 'AVAILABLE', '7-17', '{Self,Parent}'),
    (NULL, 'ADHD Rating Scale-5', 'ADHD-RS5', 'COUNSELLING', 'ADHD Assessment', 18, 10, '{en,hi,ta}', 'T1', TRUE, 'AVAILABLE', '5-17', '{Parent,Teacher}'),
    (NULL, 'Academic Stress Inventory', 'ASI', 'COUNSELLING', 'Stress', 40, 15, '{en,hi,ta,te}', 'T1', FALSE, 'AVAILABLE', '10-18', '{Self}');
