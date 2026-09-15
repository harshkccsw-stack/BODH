-- The psychometrician's item codes, joined to this platform's questions.
--
-- A scoring workbook is written entirely in the vocabulary of its Items_Master
-- tab: `V3`, `I1..I12`, `Internal Drive`, `Self-Efficacy`. This platform's
-- vocabulary is `mqt:14` and `mq:7`. Nothing joined the two, so every
-- item-level rule in a real workbook was untranslatable — the model was shown
-- a column list in which the string `V3` does not appear, and correctly
-- refused to guess. This table is that join.
--
-- WHY PER ASSESSMENT AND NOT PER QUESTION. The same bank question placed in
-- two questionnaires has two tags, and may be `I1` in one instrument and `I7`
-- in another. An item code is a property of the INSTRUMENT, not of the item,
-- so a column on `question` would force one global numbering nobody agreed to.
-- The rejected alternative was keying on the questionnaire, which would share
-- bindings between assessments over the same questionnaire — attractive until
-- you notice that re-importing one assessment's sheet would then silently
-- change what another assessment's rules mean. See
-- docs/item-master-binding-plan.md §11.3.
--
-- WHY THERE IS NO VERSION TABLE. A binding is authoring-time metadata only.
-- Item codes are resolved when a rule is TRANSLATED, and what gets stored is a
-- rule version holding the resolved `[mq:7]`; the rule version is what a
-- computation pins, exactly as today. So a binding can change afterwards
-- without altering the meaning of a rule already written, let alone an
-- approved report. That is the property that makes re-import an in-place
-- update — and the property to re-check before anything ever resolves a
-- binding at report time. §11.2.
--
-- `assessment_id` is NOT an FK, matching `report_rule`: the report tables stay
-- droppable independently of the delivery chain.

CREATE TABLE IF NOT EXISTS `report_item_binding` (
  `report_item_binding_id`    bigint       NOT NULL AUTO_INCREMENT,
  `assessment_id`             bigint       NOT NULL,

  -- ── what the sheet said ────────────────────────────────────────────────
  `item_code`                 varchar(40)  NOT NULL,
  `admin_position`            int                   DEFAULT NULL,
  `factor_label`              varchar(160)          DEFAULT NULL,
  `construct_label`           varchar(160)          DEFAULT NULL,

  -- Kept even after `question_id` resolves, and deliberately so: it is what
  -- lets a re-import notice the practitioner reworded an item, and what still
  -- answers "which question did I1 mean?" after somebody edits the stem.
  `statement`                 text         NOT NULL,
  `reverse_scored`            bit(1)       NOT NULL DEFAULT b'0',
  `in_composite`              bit(1)       NOT NULL DEFAULT b'1',

  -- ── what it resolved to ────────────────────────────────────────────────
  `question_id`               bigint                DEFAULT NULL,
  `questionnaire_question_id` bigint                DEFAULT NULL,
  `question_tag`              varchar(50)           DEFAULT NULL,
  `mq_id`                     bigint                DEFAULT NULL,
  `mqt_id`                    bigint                DEFAULT NULL,

  -- EXACT | NORMALISED | FUZZY | MANUAL | NONE. Stored rather than recomputed
  -- because it is the reviewer's audit trail: a FUZZY match that nobody
  -- widened to MANUAL is a different fact from one a person confirmed.
  `match_method`              varchar(16)  NOT NULL DEFAULT 'NONE',

  `created_at`                datetime(6)  NOT NULL,
  `updated_at`                datetime(6)  NOT NULL,

  PRIMARY KEY (`report_item_binding_id`),

  -- One binding per code per assessment. This is what makes re-import an
  -- upsert rather than a duplicate, and what a manual override addresses.
  UNIQUE KEY `uqRibAssessmentItemCode` (`assessment_id`, `item_code`),
  KEY `idxRibAssessment` (`assessment_id`),
  KEY `idxRibQuestion` (`question_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
