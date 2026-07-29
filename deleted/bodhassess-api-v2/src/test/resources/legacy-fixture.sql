-- Synthetic legacy schema for FlywayMigrationTest — the old snake_case world,
-- covering every transform: taxonomy tree, identity silos (incl. email dedupe
-- and a missing email), org + members, orphan groups, demographic fields,
-- instrument/items/options/scores, family-by-name matching, assessment +
-- allotments, and a completed session with positional answers.
DROP SCHEMA IF EXISTS legacy CASCADE;
CREATE SCHEMA legacy;

CREATE TABLE legacy.measured_qualities (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), description TEXT);
INSERT INTO legacy.measured_qualities VALUES ('mq-1', 'Cognition', 'Cognitive ability');

CREATE TABLE legacy.mqts (id VARCHAR(64) PRIMARY KEY, mq_id VARCHAR(64), parent_mqt_id VARCHAR(64),
    name VARCHAR(255), sort_order INT);
INSERT INTO legacy.mqts VALUES ('mqt-1', 'mq-1', NULL, 'Memory', 0);
INSERT INTO legacy.mqts VALUES ('mqt-2', 'mq-1', 'mqt-1', 'Working Memory', 0);

CREATE TABLE legacy.app_users (id VARCHAR(64) PRIMARY KEY, email VARCHAR(255), dob VARCHAR(20),
    status VARCHAR(20), is_super_admin BOOLEAN);
INSERT INTO legacy.app_users VALUES ('au-1', 'admin@legacy.test', '1980-01-01', 'Active', TRUE);

CREATE TABLE legacy.user_meta (user_id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), phone VARCHAR(30),
    gender VARCHAR(20), consent VARCHAR(10));
INSERT INTO legacy.user_meta VALUES ('au-1', 'Legacy Admin', '111', NULL, 'yes');

CREATE TABLE legacy.practitioners (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), email VARCHAR(255),
    phone VARCHAR(30), dob DATE);
INSERT INTO legacy.practitioners VALUES ('p-1', 'Dr. Prac', 'prac@legacy.test', '222', DATE '1985-02-02');

CREATE TABLE legacy.respondents (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), email VARCHAR(255),
    phone VARCHAR(30), dob VARCHAR(20), consent VARCHAR(10));
INSERT INTO legacy.respondents VALUES ('r-1', 'Taker One', 'taker@legacy.test', '333', '1990-03-03', 'yes');
INSERT INTO legacy.respondents VALUES ('r-2', 'No Email', NULL, NULL, 'not-a-date', 'no');
INSERT INTO legacy.respondents VALUES ('r-3', 'Admin Doppelganger', 'admin@legacy.test', NULL, '1980-01-01', 'yes');

CREATE TABLE legacy.entity_registrations (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255),
    company_name VARCHAR(255), official_email VARCHAR(255), phone VARCHAR(30), org_name VARCHAR(255),
    org_website VARCHAR(255), active BOOLEAN);
INSERT INTO legacy.entity_registrations VALUES ('e-1', 'HR Contact', 'Acme Corp', 'hr@acme.test',
    '444', NULL, 'acme.test', TRUE);

CREATE TABLE legacy.entity_members (entity_id VARCHAR(64), respondent_id VARCHAR(64));
INSERT INTO legacy.entity_members VALUES ('e-1', 'r-1');

CREATE TABLE legacy.respondent_groups (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), description TEXT,
    parent_id VARCHAR(64));
INSERT INTO legacy.respondent_groups VALUES ('g-1', 'Cohort A', NULL, NULL);

CREATE TABLE legacy.respondent_group_members (group_id VARCHAR(64), respondent_id VARCHAR(64));
INSERT INTO legacy.respondent_group_members VALUES ('g-1', 'r-1');

CREATE TABLE legacy.demographic_fields (id VARCHAR(64) PRIMARY KEY, field_key VARCHAR(128),
    label VARCHAR(255), type VARCHAR(20), required BOOLEAN, placeholder VARCHAR(255), sort_order INT,
    active BOOLEAN);
INSERT INTO legacy.demographic_fields VALUES ('df-1', 'age_group', 'Age group', 'select', TRUE, NULL, 0, TRUE);

CREATE TABLE legacy.demographic_field_options (field_id VARCHAR(64), option_value VARCHAR(255));
INSERT INTO legacy.demographic_field_options VALUES ('df-1', '18-25');
INSERT INTO legacy.demographic_field_options VALUES ('df-1', '26-35');

CREATE TABLE legacy.instruments (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), short_name VARCHAR(50),
    category VARCHAR(100), vertical VARCHAR(100), description TEXT, duration_minutes INT,
    tier_required VARCHAR(50), is_adaptive BOOLEAN, is_fixed_sequence BOOLEAN, norm_status VARCHAR(50),
    age_range VARCHAR(50), uses_weighted_scoring BOOLEAN, scoring_model VARCHAR(32));
INSERT INTO legacy.instruments VALUES ('i-1', 'Resilience Scale', 'RS', 'Clinical', 'Psychology',
    'Measures resilience', 20, NULL, FALSE, TRUE, NULL, NULL, FALSE, 'MQ_MQT');

CREATE TABLE legacy.items (id VARCHAR(64) PRIMARY KEY, instrument_id VARCHAR(64), item_format VARCHAR(30),
    stem TEXT, media_url TEXT, media_type VARCHAR(30), irt_a DOUBLE, irt_b DOUBLE, irt_c DOUBLE,
    validation_status VARCHAR(30), clinical_risk_flag BOOLEAN, risk_flag_rule TEXT, sub_domain VARCHAR(150),
    sequence_order INT);
INSERT INTO legacy.items VALUES ('it-1', 'i-1', 'MCQ', 'I bounce back quickly', NULL, NULL,
    NULL, NULL, 0.0, 'validated', FALSE, NULL, NULL, 1);
INSERT INTO legacy.items VALUES ('it-2', 'i-1', 'FREE_TEXT', 'Describe a hard week', NULL, NULL,
    NULL, NULL, 0.0, 'DRAFT', FALSE, NULL, NULL, 2);

CREATE TABLE legacy.item_options (id BIGINT PRIMARY KEY, item_id VARCHAR(64), sort_order INT,
    text TEXT, media_url TEXT, media_type VARCHAR(30));
INSERT INTO legacy.item_options VALUES (100, 'it-1', 0, 'Never', NULL, NULL);
INSERT INTO legacy.item_options VALUES (101, 'it-1', 1, 'Often', NULL, NULL);

CREATE TABLE legacy.item_question_scores (item_id VARCHAR(64), mqt_id VARCHAR(64), score DOUBLE);
INSERT INTO legacy.item_question_scores VALUES ('it-1', 'mqt-1', 1.5);

CREATE TABLE legacy.item_option_scores (option_id BIGINT, mqt_id VARCHAR(64), score DOUBLE);
INSERT INTO legacy.item_option_scores VALUES (101, 'mqt-2', 2.0);

CREATE TABLE legacy.item_languages (item_id VARCHAR(64), language VARCHAR(8));
INSERT INTO legacy.item_languages VALUES ('it-1', 'English');

CREATE TABLE legacy.questionnaires (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255));
INSERT INTO legacy.questionnaires VALUES ('f-1', 'resilience scale');

CREATE TABLE legacy.assessments (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), questionnaire_id VARCHAR(64),
    status VARCHAR(20), auto_next BOOLEAN, language VARCHAR(30));
INSERT INTO legacy.assessments VALUES ('a-1', 'Spring Drive', 'f-1', 'ACTIVE', TRUE, 'English');

CREATE TABLE legacy.assessment_entity_allotments (assessment_id VARCHAR(64), entity_id VARCHAR(64), cap INT);
INSERT INTO legacy.assessment_entity_allotments VALUES ('a-1', 'e-1', 10);

CREATE TABLE legacy.assessment_respondent_allotments (assessment_id VARCHAR(64), respondent_id VARCHAR(64));
INSERT INTO legacy.assessment_respondent_allotments VALUES ('a-1', 'r-1');

CREATE TABLE legacy.portal_sessions (id VARCHAR(64) PRIMARY KEY, assessment_id VARCHAR(64),
    respondent_id VARCHAR(64), entity_id VARCHAR(64), group_id VARCHAR(64), language VARCHAR(30),
    name VARCHAR(255), consent_id VARCHAR(64), proctoring BOOLEAN, invitation_sent BOOLEAN,
    show_question_index BOOLEAN, status VARCHAR(20), started_at TIMESTAMP, completed_at TIMESTAMP);
INSERT INTO legacy.portal_sessions VALUES ('s-1', 'a-1', 'r-1', 'e-1', NULL, 'English', 'Spring Drive',
    'consent-v1', FALSE, TRUE, TRUE, 'Completed', TIMESTAMP '2026-01-01 10:00:00',
    TIMESTAMP '2026-01-01 10:25:00');

CREATE TABLE legacy.assessment_answers (session_id VARCHAR(64), question_id VARCHAR(64),
    option_index INT, free_text TEXT);
INSERT INTO legacy.assessment_answers VALUES ('s-1', 'it-1', 1, NULL);
INSERT INTO legacy.assessment_answers VALUES ('s-1', 'it-2', NULL, 'It was rough but fine');

CREATE TABLE legacy.portal_session_mqt_scores (session_id VARCHAR(64), mqt_id VARCHAR(64), score DOUBLE);
INSERT INTO legacy.portal_session_mqt_scores VALUES ('s-1', 'mqt-1', 12.5);

CREATE TABLE legacy.portal_session_demographics (session_id VARCHAR(64), field_key VARCHAR(128), value TEXT);
INSERT INTO legacy.portal_session_demographics VALUES ('s-1', 'age_group', '26-35');
