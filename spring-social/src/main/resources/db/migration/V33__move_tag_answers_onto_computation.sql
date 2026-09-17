-- V33: a VALUE placeholder's rule is answered on the COMPUTATION, not on the
-- template binding.
--
-- Until now report_tag_binding carried report_computation_id + output_key for
-- a VALUE tag. That made a template unfinishable before a computation existed
-- and a computation unapprovable before the template was published — the two
-- pages could only be walked in a loop. The template now declares only a
-- tag's SHAPE; which rule fills it lives on report_computation_tag_guidance,
-- which already is "one row per computation per tag".
--
-- Order matters and is the CLAUDE.md rule: add nullable, backfill, then stop
-- reading the old columns. The old pointer columns are nulled here and dropped
-- in a later migration once nothing reads them. Guarded per column like V29.

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'report_computation_tag_guidance'
      AND COLUMN_NAME  = 'rule_slug'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
    'ALTER TABLE `report_computation_tag_guidance` ADD COLUMN `rule_slug` VARCHAR(80) DEFAULT NULL AFTER `guidance`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'report_computation_tag_guidance'
      AND COLUMN_NAME  = 'format'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
    'ALTER TABLE `report_computation_tag_guidance` ADD COLUMN `format` VARCHAR(40) DEFAULT NULL AFTER `rule_slug`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'report_computation_tag_guidance'
      AND COLUMN_NAME  = 'fallback_text'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
    'ALTER TABLE `report_computation_tag_guidance` ADD COLUMN `fallback_text` VARCHAR(255) DEFAULT NULL AFTER `format`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill from the template pointers. A tag that already has a guidance row
-- on that computation gets the rule written onto it; one that does not gets a
-- new row. Two statements rather than INSERT ... ON DUPLICATE KEY UPDATE with
-- VALUES(), which is deprecated.
--
-- SEVERAL TEMPLATES CAN BIND ONE COMPUTATION. report_tag_binding is keyed per
-- TEMPLATE, so a cloned template pair (15/17 in dev) yields two rows for the
-- same computation+tag — while guidance is keyed per computation+tag by
-- uqRctgComputationTag. Collapsing many bindings into one row is the whole
-- point of this migration, so one of them has to win, and the same one has to
-- win in both statements below or the UPDATE and the INSERT would disagree.
-- The winner is the LOWEST report_tag_binding_id (the earliest template to
-- bind the tag). Without this guard the INSERT dies on errno 1062 partway
-- through, after the three ALTERs above have already committed.
UPDATE `report_computation_tag_guidance` g
  JOIN `report_tag_binding` b
    ON b.`report_computation_id` = g.`report_computation_id`
   AND b.`tag` = g.`tag`
   SET g.`rule_slug`     = b.`output_key`,
       g.`format`        = COALESCE(g.`format`, b.`format`),
       g.`fallback_text` = COALESCE(g.`fallback_text`, b.`fallback_text`)
 WHERE b.`binder_type` = 'VALUE'
   AND b.`output_key` IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM `report_tag_binding` b2
         WHERE b2.`report_computation_id` = b.`report_computation_id`
           AND b2.`tag`                   = b.`tag`
           AND b2.`binder_type`           = 'VALUE'
           AND b2.`output_key` IS NOT NULL
           AND b2.`report_tag_binding_id` < b.`report_tag_binding_id`);

INSERT INTO `report_computation_tag_guidance`
    (`report_computation_id`, `tag`, `guidance`, `rule_slug`, `format`, `fallback_text`, `sort_order`)
SELECT b.`report_computation_id`, b.`tag`, NULL, b.`output_key`, b.`format`, b.`fallback_text`, b.`sort_order`
  FROM `report_tag_binding` b
  JOIN `report_computation` c ON c.`report_computation_id` = b.`report_computation_id`
 WHERE b.`binder_type` = 'VALUE'
   AND b.`output_key` IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM `report_computation_tag_guidance` g
         WHERE g.`report_computation_id` = b.`report_computation_id`
           AND g.`tag` = b.`tag`)
   AND NOT EXISTS (
        SELECT 1 FROM `report_tag_binding` b2
         WHERE b2.`report_computation_id` = b.`report_computation_id`
           AND b2.`tag`                   = b.`tag`
           AND b2.`binder_type`           = 'VALUE'
           AND b2.`output_key` IS NOT NULL
           AND b2.`report_tag_binding_id` < b.`report_tag_binding_id`);

-- The template no longer points at a computation. Nothing reads these after
-- this migration; a later one drops them.
UPDATE `report_tag_binding`
   SET `report_computation_id` = NULL, `output_key` = NULL
 WHERE `report_computation_id` IS NOT NULL OR `output_key` IS NOT NULL;
