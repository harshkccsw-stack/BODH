-- The range a NUMBER demographic field accepts (2026-10-13): an optional
-- floor and an optional cap on the number typed, so "Age" set to 18 to 60
-- cannot be answered 7 or 400. Either end may be set alone ("18 or more",
-- "up to 100"); both NULL is any number, which is what every field meant
-- before this — no backfill.
--
-- NULL on every other field type; the field flow clears both whenever the
-- type is not NUMBER. DOUBLE, not BIGINT like V50's question range: a NUMBER
-- demographic has always accepted decimals (the portal validates with
-- Double.parseDouble), so its ends may be decimals too, and DOUBLE matches the
-- entity's Double (see V25 on Hibernate validate). Once a field has answers a
-- new range must still contain every one of them — enforced in
-- DemographicFieldController, not here.
--
-- Physical columns are snake_case: @Column(name = "numberMin") is a logical
-- name that Hibernate's CamelCaseToUnderscores strategy lowers (see V35).
--
-- Guarded: a plain ADD COLUMN fails with errno 1060 if the column is already
-- there and, MySQL committing DDL implicitly, could not roll back. The probe
-- makes a re-run a no-op.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'demographic_field'
      AND COLUMN_NAME  = 'number_min'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `demographic_field`
        ADD COLUMN `number_min` DOUBLE NULL DEFAULT NULL AFTER `other_option_label`,
        ADD COLUMN `number_max` DOUBLE NULL DEFAULT NULL AFTER `number_min`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
