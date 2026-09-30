-- One measured quality per name (2026-09-30).
--
-- MQ names become unique. MQT names deliberately do NOT: the same type name
-- may sit under several MQs, and the rule that the same name may not repeat
-- among SIBLINGS is enforced in MeasuredQualityTypeController, because a
-- root type has no parent and MySQL never treats two NULL parents as equal.
--
-- The key is case- and accent-insensitive through the table's collation
-- (utf8mb4_0900_ai_ci), matching the controller's ignore-case pre-check, so
-- "Internal Drive" and "internal drive" collide here as well.
--
-- Guard 1, refuse to run: if duplicate names already exist, the ADD UNIQUE
-- would fail anyway. Abort BEFORE any DDL with an error that names the
-- problem (a query on a column that does not exist), so the database is
-- left untouched and the duplicates can be merged by hand first.
SET @dupes := (
    SELECT COUNT(*) FROM (
        SELECT 1 FROM `measured_quality`
        GROUP BY `name`
        HAVING COUNT(*) > 1
    ) d
);
SET @guard := IF(
    @dupes > 0,
    'SELECT `duplicate_measured_quality_names_exist_merge_them_first` FROM `measured_quality`',
    'SELECT 1'
);
PREPARE stmt FROM @guard;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Guard 2, idempotent: skip when the key already exists.
SET @has_key := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'measured_quality'
      AND INDEX_NAME   = 'uqMqName'
);
SET @ddl := IF(
    @has_key > 0,
    'SELECT 1',
    'ALTER TABLE `measured_quality` ADD UNIQUE KEY `uqMqName` (`name`)'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
