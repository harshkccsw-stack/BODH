-- Report engine, phase P2: the rules library, and the computation draft that
-- assembles rules + template + respondents + a guidance prompt into something
-- ready to send to an AI.
--
-- FIVE tables, no alteration to an existing one.
--
-- ── Why `report_rule` is NOT `report_computation` ────────────────────────────
--
-- These are two different things and merging them was the mistake to avoid:
--
--   report_rule       - what the PSYCHOMETRICIAN wrote. A named, reusable unit
--                       of scoring or interpretation logic. Either a formula in
--                       the Data Studio grammar, or a plain-language statement
--                       for the rules that are not pure maths. This is INPUT.
--
--   report_computation- the thing that will eventually hold GENERATED PYTHON.
--                       One per (assessment x template) job. It REFERENCES rule
--                       versions; it does not contain them.
--
-- A rule is written once and reused across many computations, which is the
-- whole point of a library. A computation is disposable in a way a rule is not.
--
-- ── Versioning ──────────────────────────────────────────────────────────────
--
-- Editing a rule does NOT mutate it: every save writes a new immutable
-- `report_rule_version`, and a computation pins the exact VERSION it used. That
-- is what makes "publishing a rule edit cannot silently change an approved
-- report" true rather than aspirational, and it is the reason the approval gate
-- (P5) means anything at all.
--
-- ── What is deliberately NOT here ───────────────────────────────────────────
--
--   * `report_computation_version` (the generated code, artifact_kind /
--     artifact_body / sandbox_image_digest). No AI provider has been chosen, so
--     no artifact can exist yet, and a table whose shape is guessed before its
--     first row is a table that gets a correcting migration. It arrives with
--     P4, in its own V<n>.
--   * `report_definition` / `report_definition_active`. Those pair an approved
--     computation with an assessment for delivery — P5's concern, and P5 is the
--     mandatory human approval gate, which cannot be built before there is
--     something to approve.
--
-- (The plan's phase table had V26 carrying report_computation_version and
-- report_definition. It does not, for the reason above. Migration numbers are
-- assigned in SHIP order, never reserved, so those simply take the next free
-- number when they are actually written.)
--
-- Guard: CREATE TABLE IF NOT EXISTS throughout, parents first. MySQL commits
-- DDL implicitly and cannot roll back, so a re-run has to be a no-op.
--
-- Physical names are snake_case; the entities' @Table/@Column are the LOGICAL
-- camelCase names Hibernate's CamelCaseToUnderscores strategy converts.

-- ── The rules library ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `report_rule` (
  `report_rule_id`     bigint       NOT NULL AUTO_INCREMENT,
  `name`               varchar(160) NOT NULL,

  -- How a rule is referenced from a prompt and, later, from another rule.
  -- Globally unique: a psychometrician saying "use the Extraversion composite"
  -- must mean exactly one thing across the whole library.
  `slug`               varchar(80)  NOT NULL,

  `description`        varchar(1000) DEFAULT NULL,

  -- NULL = global. A rule written over mqt: keys is portable to any assessment
  -- that scores those MQTs, which is what makes this a library rather than a
  -- per-assessment formula list. Scoping to one assessment is the exception.
  -- NOT an FK: a rule outliving an assessment is fine and blocking an
  -- assessment delete because a draft rule mentions it is not.
  `assessment_id`      bigint       DEFAULT NULL,

  `status`             varchar(12)  NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | ARCHIVED
  `created_by_user_id` bigint       DEFAULT NULL,
  `created_at`         datetime(6)  NOT NULL,
  `updated_at`         datetime(6)  NOT NULL,

  PRIMARY KEY (`report_rule_id`),
  UNIQUE KEY `uqRrSlug` (`slug`),
  KEY `idxRrAssessment` (`assessment_id`),
  KEY `idxRrStatus` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `report_rule_version` (
  `report_rule_version_id` bigint      NOT NULL AUTO_INCREMENT,
  `report_rule_id`         bigint      NOT NULL,
  `version`                int         NOT NULL,

  -- EXPRESSION - a formula in the Data Studio grammar, over real column keys.
  -- STATEMENT  - plain language, for the rules that are not pure maths. Sent to
  --              the model verbatim; never parsed, never evaluated here.
  `definition_kind`        varchar(16) NOT NULL,

  -- EXPRESSION only. Validated against the LIVE per-assessment column list at
  -- save time, so a rule cannot reference a column that does not exist.
  `expression`             text        DEFAULT NULL,

  -- STATEMENT only. The psychometrician's own words, stored raw. Spec §5 is
  -- explicit that rule text reaches the model unparaphrased.
  `statement_text`         text        DEFAULT NULL,

  -- NUMBER | TERM | TEXT. Inferred for EXPRESSION, declared for STATEMENT.
  `result_type`            varchar(16) DEFAULT NULL,

  -- JSON array of the column keys the expression referenced, from
  -- ExpressionService.validate(). Used to check portability to another
  -- assessment, and to build the "declared columns only" input the sandbox is
  -- handed in P3/P4.
  `referenced_keys_json`   text        DEFAULT NULL,

  -- True when the expression uses a population function (ZSCORE, PERCENTILE,
  -- RANK, ...) — i.e. its answer MOVES as more respondents complete. Derived
  -- from the parser's evalTarget, never asked. Drives the min-cohort guard.
  `is_population`          tinyint(1)  NOT NULL DEFAULT 0,

  -- Which assessment the expression was validated against when it was saved.
  -- Recorded so a later "is this rule still valid here?" check can say what
  -- "still" means.
  `validated_assessment_id` bigint     DEFAULT NULL,

  `notes`                  text        DEFAULT NULL,
  `created_by_user_id`     bigint      DEFAULT NULL,
  `created_at`             datetime(6) NOT NULL,

  PRIMARY KEY (`report_rule_version_id`),
  UNIQUE KEY `uqRrvRuleVersion` (`report_rule_id`, `version`),
  CONSTRAINT `fkRrvRule` FOREIGN KEY (`report_rule_id`)
    REFERENCES `report_rule` (`report_rule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── The computation draft ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `report_computation` (
  `report_computation_id` bigint       NOT NULL AUTO_INCREMENT,
  `name`                  varchar(160) NOT NULL,
  `slug`                  varchar(80)  NOT NULL,
  `description`           varchar(1000) DEFAULT NULL,

  -- NOT NULL: a computation targets one assessment, and that is what every
  -- column reference is validated against. A draft with no assessment could
  -- not be checked at all.
  `assessment_id`         bigint       NOT NULL,

  -- Narrows the cohort to one org's members. NULL = every respondent.
  `organization_id`       bigint       DEFAULT NULL,

  -- The template whose ${tags} this computation must fill. Nullable while a
  -- draft is being assembled; required before it can be sent for generation.
  `report_template_id`    bigint       DEFAULT NULL,

  -- DRAFT              - being assembled; may be incomplete
  -- READY_FOR_GENERATION - everything the meta-prompt needs is present
  -- GENERATED          - an artifact exists (P4)
  -- APPROVED           - a human read sample reports and signed off (P5)
  -- ARCHIVED
  `status`                varchar(24)  NOT NULL DEFAULT 'DRAFT',

  -- The psychometrician's guidance prompt, verbatim. Spec §5 sends this to the
  -- model unedited, so it is stored unedited.
  `source_prompt`         text         DEFAULT NULL,

  -- SELECTED | ALL_COMPLETED. Which respondents the sample and the eventual
  -- test run are drawn from.
  `respondent_scope`      varchar(16)  NOT NULL DEFAULT 'ALL_COMPLETED',

  -- JSON array of respondentUserIds when respondent_scope = SELECTED.
  `respondent_ids_json`   text         DEFAULT NULL,

  `created_by_user_id`    bigint       DEFAULT NULL,
  `created_at`            datetime(6)  NOT NULL,
  `updated_at`            datetime(6)  NOT NULL,

  PRIMARY KEY (`report_computation_id`),
  UNIQUE KEY `uqRcSlug` (`slug`),
  KEY `idxRcAssessment` (`assessment_id`),
  KEY `idxRcStatus` (`status`),
  CONSTRAINT `fkRcTemplate` FOREIGN KEY (`report_template_id`)
    REFERENCES `report_template` (`report_template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which rule VERSIONS this computation uses. Pinned to the version, not the
-- rule: that is what stops a later rule edit changing what an approved
-- computation meant.
CREATE TABLE IF NOT EXISTS `report_computation_rule` (
  `report_computation_rule_id` bigint NOT NULL AUTO_INCREMENT,
  `report_computation_id`      bigint NOT NULL,
  `report_rule_version_id`     bigint NOT NULL,
  `sort_order`                 int    NOT NULL DEFAULT 0,

  PRIMARY KEY (`report_computation_rule_id`),
  UNIQUE KEY `uqRcrComputationRuleVersion`
    (`report_computation_id`, `report_rule_version_id`),
  KEY `idxRcrRuleVersion` (`report_rule_version_id`),
  CONSTRAINT `fkRcrComputation` FOREIGN KEY (`report_computation_id`)
    REFERENCES `report_computation` (`report_computation_id`),
  -- Deliberately NOT cascading: a rule version referenced by a computation
  -- must not be deletable. The FK is the net behind the service's pre-check.
  CONSTRAINT `fkRcrRuleVersion` FOREIGN KEY (`report_rule_version_id`)
    REFERENCES `report_rule_version` (`report_rule_version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-tag guidance: "use rule X and rule Y to fill ${overall_summary}".
--
-- Separate from report_tag_binding.author_note on purpose. A binding note
-- belongs to the TEMPLATE and is the same for everyone who uses it; this
-- belongs to one COMPUTATION, so two computations over the same template can
-- give the same tag different instructions.
CREATE TABLE IF NOT EXISTS `report_computation_tag_guidance` (
  `report_computation_tag_guidance_id` bigint      NOT NULL AUTO_INCREMENT,
  `report_computation_id`              bigint      NOT NULL,
  `tag`                                varchar(80) NOT NULL,
  `guidance`                           text        DEFAULT NULL,
  `sort_order`                         int         NOT NULL DEFAULT 0,

  PRIMARY KEY (`report_computation_tag_guidance_id`),
  UNIQUE KEY `uqRctgComputationTag` (`report_computation_id`, `tag`),
  CONSTRAINT `fkRctgComputation` FOREIGN KEY (`report_computation_id`)
    REFERENCES `report_computation` (`report_computation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
