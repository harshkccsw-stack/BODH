-- 016_roles.sql
-- Roles table for the Permissions admin page. Each role bundles a set of URL
-- path patterns that grant page access (e.g. "/admin/*", "/counsellor/*").
-- Role names also feed the role dropdown on the User Management page.

CREATE TABLE IF NOT EXISTS roles (
    id          VARCHAR(64)  PRIMARY KEY,
    name        VARCHAR(128) NOT NULL UNIQUE,
    description TEXT,
    url_paths   JSONB        NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS roles_updated_at ON roles;
CREATE TRIGGER roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO roles (id, name, description, url_paths) VALUES
    ('ROLE-ADMIN',     'Platform Admin',      'Full system access across all tenants and verticals.', '["/*"]'),
    ('ROLE-TENANT',    'Tenant Admin',        'Full access within their assigned tenant.',            '["/admin/*","/dashboard"]'),
    ('ROLE-SR-PRAC',   'Senior Practitioner', 'Manage other practitioners and view aggregate data.',  '["/dashboard","/assessments/*","/clinical/*","/reports/*"]'),
    ('ROLE-PRAC',      'Practitioner',        'Administer assessments and view own client data.',     '["/dashboard","/assessments","/assessments/create","/reports"]'),
    ('ROLE-VIEWER',    'BodhLens Viewer',     'Read-only access to analytics and reports.',           '["/analytics","/reports/*"]'),
    ('ROLE-RESPONDENT','Respondent',          'Take assessments and view own data via the portal.',   '["/portal/*"]')
ON CONFLICT (id) DO NOTHING;
