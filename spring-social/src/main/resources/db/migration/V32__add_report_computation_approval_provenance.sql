-- V32: who approved a report computation, when, and over how many completed
-- respondents.
--
-- Approval is the one human act between a formula and a PDF about a real
-- person, and until now it left no record. All three columns are nullable
-- with no backfill: a computation approved before this migration genuinely
-- has no approver on file, and inventing one would be worse than a null.
--
-- Guarded per column like V29, so a re-run is a no-op.

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'report_computation'
      AND COLUMN_NAME  = 'approved_by_user_id'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
    'ALTER TABLE `report_computation` ADD COLUMN `approved_by_user_id` BIGINT DEFAULT NULL AFTER `created_by_user_id`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'report_computation'
      AND COLUMN_NAME  = 'approved_at'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
    'ALTER TABLE `report_computation` ADD COLUMN `approved_at` DATETIME(6) DEFAULT NULL AFTER `approved_by_user_id`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'report_computation'
      AND COLUMN_NAME  = 'approved_cohort_size'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
    'ALTER TABLE `report_computation` ADD COLUMN `approved_cohort_size` INT DEFAULT NULL AFTER `approved_at`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
