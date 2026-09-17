-- Public product catalog: assessments listed on the marketing site carry a
-- price. Both columns are nullable — an assessment without a price is still a
-- valid assessment and renders as "Price on request" on the website, so there
-- is nothing to backfill and no NOT NULL tightening to follow.
--
-- Refuse to run twice: MySQL commits DDL implicitly, so this guard sits above
-- the first ALTER rather than relying on a rollback that cannot happen.
SET @already := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 'assessment'
     AND COLUMN_NAME  IN ('price', 'currency')
);

SET @stmt := IF(@already > 0, 'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''V2 aborted: assessment.price/currency already exist''', 'SELECT 1');
PREPARE guard FROM @stmt;
EXECUTE guard;
DEALLOCATE PREPARE guard;

ALTER TABLE `assessment`
  ADD COLUMN `price`    DECIMAL(10,2) NULL,
  ADD COLUMN `currency` VARCHAR(3)    NULL;
