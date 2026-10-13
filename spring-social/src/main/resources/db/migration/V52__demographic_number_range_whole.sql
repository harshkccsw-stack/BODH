-- A NUMBER demographic field takes WHOLE numbers only (2026-10-13, user's
-- decision): no decimals, so the range V51 added the same day as DOUBLE
-- becomes BIGINT, like a Number question's range (V50). The answer itself is
-- held to digits only (AnswerFormat.WHOLE_NUMBER_PATTERN) by the begin
-- validator — answers already stored are text and are not touched here.
--
-- A correction in its own migration because V51 was already applied: Flyway
-- checksums applied files, and an edited one fails every later boot.
--
-- Guard, refuse to run: DOUBLE -> BIGINT ROUNDS a fractional value silently.
-- Abort BEFORE the ALTER (MySQL commits DDL implicitly, nothing would roll
-- back) with an error that names the problem — a query on a column that does
-- not exist — and fix those ends by hand.
SET @fractional := (
    SELECT COUNT(*)
    FROM `demographic_field`
    WHERE `number_min` <> FLOOR(`number_min`)
       OR `number_max` <> FLOOR(`number_max`)
);
SET @guard := IF(
    @fractional > 0,
    'SELECT `demographic_number_range_has_decimals_fix_by_hand_first` FROM `demographic_field`',
    'SELECT 1'
);
PREPARE stmt FROM @guard;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- MODIFY to the type the column already has is a no-op, so a re-run is safe.
ALTER TABLE `demographic_field`
    MODIFY COLUMN `number_min` BIGINT NULL DEFAULT NULL,
    MODIFY COLUMN `number_max` BIGINT NULL DEFAULT NULL;
