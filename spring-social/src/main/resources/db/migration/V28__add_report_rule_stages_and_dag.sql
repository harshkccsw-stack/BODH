-- Report engine, per-assessment authoring: which STEP a rule belongs to, and
-- which other RULES it consumes.
--
-- Three additive columns, no table created, no column tightened. Additive
-- because both facts are new information about rules that already work, not a
-- correction to them.
--
-- ── 1. `stage` + `step_order` on report_rule, not on the version ────────────
--
-- The psychometrician's workbook states scoring as an ordered pipeline —
-- validity checks, then score computation, then bands, then profile text — and
-- the authoring screen is that pipeline. `stage` records which step a rule
-- belongs to.
--
-- It sits on the RULE and not on the version on purpose. Dragging a rule from
-- "bands" to "profile" is a change of filing, not of logic: it must not mint a
-- new immutable version, because a version is the thing a computation pins and
-- an approved report is explained by. If reorganising the rail rewrote history,
-- version numbers would stop meaning "the logic changed".
--
-- Five values, and deliberately not seven:
--
--   VALIDITY  - workbook step 1. Flags and hard fails.
--   SCORE     - step 3. Factor and composite computation.
--   BAND      - step 4. Cut points to a named band.
--   PROFILE   - step 5. Cross-factor interpretation text.
--   EDGE      - the workbook's edge cases: retakes, ties, norm updates.
--
-- Steps 0 (data capture) and 2 (reverse scoring) have NO stage value because
-- neither is a report rule. Step 0 is the platform: answers already exist per
-- attempt and "all items answered" is the COMPLETED filter the dataset applies.
-- Step 2 belongs upstream in the question bank — reversed option scores, and
-- later a Question.reverseScored flag — because MqtScoringService sums
-- OptionMqtScore, so a reverse applied at report time would make `mqt:` mean one
-- thing in Data Studio and another in a report. Two sources of truth for a
-- score, diverging silently. Both steps appear on the screen as read-only
-- panels, which is why they need no stage to file rules under.
--
-- DEFAULT 'SCORE' is for the rows that already exist. Rules written before the
-- steps existed are overwhelmingly factor computations, and SCORE is the only
-- honest guess; it is a filing default a human can drag, never a claim about
-- logic. New rules always state their stage.
--
-- ── 2. `referenced_rule_slugs_json` on report_rule_version ──────────────────
--
-- The pipeline's defining property is that each step consumes the previous
-- step's output — a band rule reads a composite, a profile rule reads two
-- factors. Until now that dependency existed only as PROSE: RuleReferenceLint
-- checks that a guidance prompt naming `a-slug` actually selected that rule, but
-- nothing evaluated a chain. "Step 4 uses step 3's output" was a hope.
--
-- It becomes a checked edge here. A rule refers to another as `[rule:<slug>]`,
-- which needs NO grammar change whatsoever: the expression lexer already reads
-- anything bracketed as a reference (that is why real columns are written
-- `[mqt:14]` — '-' is subtraction and ':' separates the family prefix), so
-- `[rule:internal-drive]` parses today and simply resolves to nothing. The
-- report layer supplies the `rule:` keys alongside the assessment's real columns
-- when it validates, so a slug that names no ACTIVE rule is rejected exactly the
-- way an invented MQT is.
--
-- Stored as the DIRECT edges only. The transitive closure is walked when it is
-- needed (portability, evaluation order) rather than stored, for the same reason
-- the column catalog is read live: a stored closure goes stale the moment any
-- rule in the chain is edited, and stale-and-silent is the failure this whole
-- design is arranged to prevent.
--
-- Kept SEPARATE from referenced_keys_json, which stays columns-only. A rule
-- reference is not a column, and mixing them would break the portability check
-- that asks whether referenced_keys is a subset of this assessment's columns.
--
-- Guarded per column: a plain ADD COLUMN fails with errno 1060 if it already
-- exists, and MySQL commits DDL implicitly so that failure could not roll back.
-- Each prepared statement no-ops when its column is present, so a re-run is safe.

-- ── report_rule.stage ───────────────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'report_rule'
      AND COLUMN_NAME  = 'stage'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
    'ALTER TABLE `report_rule` ADD COLUMN `stage` VARCHAR(24) NOT NULL DEFAULT ''SCORE'' AFTER `assessment_id`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── report_rule.step_order ──────────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'report_rule'
      AND COLUMN_NAME  = 'step_order'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
    'ALTER TABLE `report_rule` ADD COLUMN `step_order` INT NOT NULL DEFAULT 0 AFTER `stage`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Filing is always read stage-by-stage, in author order.
SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'report_rule'
      AND INDEX_NAME   = 'idxRrStageOrder'
);
SET @ddl := IF(@idx_exists > 0, 'SELECT 1',
    'ALTER TABLE `report_rule` ADD KEY `idxRrStageOrder` (`stage`, `step_order`)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── report_rule_version.referenced_rule_slugs_json ──────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'report_rule_version'
      AND COLUMN_NAME  = 'referenced_rule_slugs_json'
);
SET @ddl := IF(@col_exists > 0, 'SELECT 1',
    'ALTER TABLE `report_rule_version` ADD COLUMN `referenced_rule_slugs_json` TEXT DEFAULT NULL AFTER `referenced_keys_json`');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
