-- Add an inline logo to the organization catalog.
--
-- The logo is a base64 data URL, stored straight in the row (no object
-- storage yet), so it needs LONGTEXT — TEXT's 64 KB is too small. The column
-- is NULLABLE: existing orgs keep no logo and the create/edit form leaves it
-- optional.
--
-- Guard first: this migration is a plain ADD COLUMN, so if a prior manual
-- patch already added `logo_base64` the ALTER would fail with errno 1060 and,
-- because MySQL commits DDL implicitly, could not roll back. The prepared
-- statement below no-ops when the column already exists, so a re-run is safe.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'organization'
      AND COLUMN_NAME  = 'logo_base64'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `organization` ADD COLUMN `logo_base64` LONGTEXT NULL AFTER `org_email`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
