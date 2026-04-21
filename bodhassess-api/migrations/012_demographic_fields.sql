-- 012_demographic_fields.sql
-- Catalogue of reusable demographic fields (name, DOB, gender, etc.). Each
-- questionnaire can opt-in to a subset via `demographic_field_keys` on
-- `published_questionnaires`. The portal-take page renders the form
-- dynamically from this catalogue.

CREATE TABLE IF NOT EXISTS demographic_fields (
    id           VARCHAR(64)  PRIMARY KEY,
    field_key    VARCHAR(64)  NOT NULL UNIQUE,   -- machine identifier used in the answer JSON
    label        VARCHAR(255) NOT NULL,           -- human label shown in the UI
    type         VARCHAR(32)  NOT NULL DEFAULT 'text',   -- text | number | date | select | textarea
    required     BOOLEAN      NOT NULL DEFAULT FALSE,
    placeholder  TEXT,
    options      JSONB        NOT NULL DEFAULT '[]',     -- array of strings for select
    sort_order   INT          NOT NULL DEFAULT 100,
    active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_fields_active ON demographic_fields (active, sort_order);

DROP TRIGGER IF EXISTS demographic_fields_updated_at ON demographic_fields;
CREATE TRIGGER demographic_fields_updated_at BEFORE UPDATE ON demographic_fields
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed the defaults the portal used before this table existed (only if the
-- table is empty; re-running the migration is safe).
INSERT INTO demographic_fields (id, field_key, label, type, required, placeholder, options, sort_order)
SELECT * FROM (VALUES
    ('df-fullname',         'fullName',         'Full Name',                      'text',     TRUE,  NULL::text,                                     '[]'::jsonb, 10),
    ('df-dob',              'dob',              'Date of Birth',                  'date',     TRUE,  NULL::text,                                     '[]'::jsonb, 20),
    ('df-age',              'age',              'Age',                            'number',   TRUE,  NULL::text,                                     '[]'::jsonb, 30),
    ('df-gender',           'gender',           'Gender',                         'select',   TRUE,  NULL::text,
        '["Male","Female","Non-binary","Other","Prefer not to say"]'::jsonb, 40),
    ('df-marital',          'maritalStatus',    'Marital Status',                 'select',   FALSE, NULL::text,
        '["Single","Married","Divorced","Widowed"]'::jsonb, 50),
    ('df-education',        'education',        'Education Level',                'select',   FALSE, NULL::text,
        '["Below 10th","10th","12th","Diploma","Graduate","Post-graduate","Doctorate"]'::jsonb, 60),
    ('df-occupation',       'occupation',       'Occupation',                     'text',     FALSE, 'e.g., Software Engineer',                      '[]'::jsonb, 70),
    ('df-siblings',         'siblings',         'Number of Siblings',             'number',   FALSE, NULL::text,                                     '[]'::jsonb, 80),
    ('df-family-type',      'familyType',       'Family Type',                    'select',   FALSE, NULL::text,
        '["Nuclear","Joint","Single-parent","Other"]'::jsonb, 90),
    ('df-parent-occupation','parentOccupation', 'Parent / Guardian Occupation',   'text',     FALSE, NULL::text,                                     '[]'::jsonb, 100),
    ('df-primary-language', 'primaryLanguage',  'Primary Language',               'text',     FALSE, 'e.g., English, Hindi',                         '[]'::jsonb, 110),
    ('df-notes',            'notes',            'Notes',                          'textarea', FALSE, 'Anything the practitioner should know.',       '[]'::jsonb, 120)
) AS seed (id, field_key, label, type, required, placeholder, options, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM demographic_fields);

-- Per-questionnaire opt-in list: array of field_key strings. Empty/NULL means
-- "use every active field in the catalogue" so old questionnaires keep working.
ALTER TABLE published_questionnaires
    ADD COLUMN IF NOT EXISTS demographic_field_keys JSONB;
