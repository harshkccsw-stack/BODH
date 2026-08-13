-- Optional employer-issued respondent code, and the second credential the
-- portal accepts: login takes email OR employeeId, both checked against dob.
--
-- Lives on respondent_user, NOT on `User`, because the uniqueness rule is
-- per-organization — two client organizations may each issue "EMP001" — and
-- only this table carries organization_id to key against. `User` rows have no
-- organization (it is a profile-level field), so the constraint below could
-- not be expressed there.
--
-- NULLable with no backfill: the field is optional and every existing
-- respondent predates it. Those respondents keep signing in with their email
-- until an admin fills the code in.
--
-- Physical names are snake_case (`employee_id`): the entity's
-- @Column(name = "employeeId") is a LOGICAL name that Hibernate's
-- CamelCaseToUnderscores naming strategy lowercases with underscores — same as
-- `organization_id` / `is_consented` on this table. Get this wrong and
-- ddl-auto: validate refuses to boot.
--
-- Two caveats on the unique key, which is a backstop rather than the rule:
--   * MySQL treats NULLs as never-equal, so it enforces NOTHING for
--     unaffiliated respondents (organization_id IS NULL) — two of them could
--     both hold "EMP001".
--   * It also permits many NULL employee_id rows per organization, which is
--     exactly what "optional" needs.
-- The real enforcement is the pre-check in RespondentController, which has to
-- exist anyway to return 409 instead of failing at commit.
--
-- The table's collation is utf8mb4_0900_ai_ci (case-insensitive), so this key
-- and the repository's findByEmployeeIdIgnoreCase agree without further work.
--
-- Guard first: ALTER implicitly commits and cannot roll back, so if a prior
-- manual patch already added either object the statement would fail (errno
-- 1060 / 1061). Both prepared statements below no-op when their object
-- exists, so a re-run is safe.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'respondent_user'
      AND COLUMN_NAME  = 'employee_id'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `respondent_user` ADD COLUMN `employee_id` VARCHAR(32) NULL AFTER `phone`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Separate statement: the column must exist before the key can reference it.
SET @key_exists := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'respondent_user'
      AND INDEX_NAME   = 'uqRespondentUserOrgEmployeeId'
);

SET @ddl := IF(
    @key_exists > 0,
    'SELECT 1',
    'ALTER TABLE `respondent_user` ADD UNIQUE KEY `uqRespondentUserOrgEmployeeId` (`organization_id`, `employee_id`)'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Note: the existing plain KEY `fkRespondentUserOrganization` (organization_id)
-- is left alone. The new composite key could serve that FK, but dropping the
-- old one risks errno 1553, and a redundant index on a table this size costs
-- nothing.
