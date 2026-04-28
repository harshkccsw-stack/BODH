-- 017_practitioner_roles_array.sql
-- Practitioners can hold multiple roles. Replace the single VARCHAR `role`
-- column with a JSONB array `roles`, backfilling from the existing value.

ALTER TABLE practitioners
    ADD COLUMN IF NOT EXISTS roles JSONB NOT NULL DEFAULT '[]';

UPDATE practitioners
   SET roles = jsonb_build_array(role)
 WHERE role IS NOT NULL
   AND role <> ''
   AND (roles = '[]'::jsonb OR roles IS NULL);

ALTER TABLE practitioners
    DROP COLUMN IF EXISTS role;
