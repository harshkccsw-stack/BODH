-- A SECOND organization logo, for co-branding the respondent's take flow.
--
-- `logo_base64` (V2) is the registration-form logo: it identifies who the
-- respondent is signing up with, on one unauthenticated page. This one is a
-- different job — it sits in the portal's sticky header for the whole of an
-- assessment (terms → demographics → instructions → questions → done), beside
-- the assessment name. Two logos rather than one because the two contexts want
-- different artwork: a square mark reads well at 48px above a form, a
-- horizontal lockup reads well at 32px in a header.
--
-- Same storage as V2 — a base64 data URL straight in the row, LONGTEXT because
-- TEXT's 64 KB cannot hold one, no object storage yet. NULLABLE with no
-- backfill: it is optional, and an organization that never sets it shows the
-- portal's own mark exactly as before.
--
-- Guard first: a plain ADD COLUMN fails with errno 1060 if a prior manual
-- patch already added it, and MySQL commits DDL implicitly so the failure
-- could not roll back. The prepared statement below no-ops when the column
-- exists, so a re-run is safe.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'organization'
      AND COLUMN_NAME  = 'co_brand_logo_base64'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `organization` ADD COLUMN `co_brand_logo_base64` LONGTEXT NULL AFTER `logo_base64`'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
