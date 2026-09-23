-- Per-section switch: repeat the section's instruction above EVERY question of
-- that section, instead of only the one that opens it.
--
-- Until now the portal showed a section's instruction exactly once — on the
-- first question of the run (question-runner's `pos === 0 ? ... : null`), as
-- the signal that the respondent had crossed into a new section. For a section
-- whose instruction is a standing rule ("rate each statement as it applies to
-- you at work"), once is not enough: by question nine it has scrolled out of
-- living memory. This flag makes the same banner render above every question.
--
-- Physical column is snake_case (`show_instruction_on_each_question`): the
-- entity's @Column(name = "showInstructionOnEachQuestion") is a LOGICAL name
-- that Hibernate's CamelCaseToUnderscores strategy lowercases with
-- underscores, exactly as `sort_order` in V13. Get this wrong and
-- ddl-auto: validate refuses to boot.
--
-- NOT NULL needs no backfill here, unlike V13's sort_order: DEFAULT 0 is the
-- behaviour every existing section already has, so filling the column with
-- zeroes is the correct answer rather than the accident to avoid. Nothing
-- live changes appearance when this applies.
--
-- Guard first: a plain ADD COLUMN fails with errno 1060 if the column is
-- somehow already there and, because MySQL commits DDL implicitly, could not
-- roll back. The probe makes a re-run a no-op.
SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'section'
      AND COLUMN_NAME  = 'show_instruction_on_each_question'
);

SET @ddl := IF(
    @col_exists > 0,
    'SELECT 1',
    'ALTER TABLE `section`
        ADD COLUMN `show_instruction_on_each_question` bit(1) NOT NULL DEFAULT b''0''
        AFTER `instruction`'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
