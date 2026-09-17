-- Narrative placeholders: prose a model writes from values that were already
-- computed by formula, stored once per (computation, attempt, tag).
--
-- STORED and not regenerated on demand, for the same reason the rule VERSIONS
-- are pinned: a report already handed to a person has to keep saying what it
-- said. A model asked the same question twice does not answer it the same way
-- twice, so regenerating on every download would make an issued report
-- inexplicable — the one property this whole subsystem is built to preserve.
--
-- `prompt_fingerprint` is what makes the cache honest. It is a hash of
-- everything that went in: the guidance, the tag, the model, and the computed
-- values themselves. Change any of them and the stored row no longer matches,
-- so it is regenerated instead of silently serving prose that describes a
-- different score. Without it, editing the guidance would leave every
-- respondent's existing narrative frozen at the old wording.

CREATE TABLE IF NOT EXISTS `report_narrative` (
  `report_narrative_id`              bigint      NOT NULL AUTO_INCREMENT,
  `report_computation_id`            bigint      NOT NULL,
  `respondent_assessment_mapping_id` bigint      NOT NULL,
  `tag`                              varchar(80) NOT NULL,
  `narrative_text`                   text        NOT NULL,
  `prompt_fingerprint`               varchar(64) NOT NULL,
  `model`                            varchar(80) DEFAULT NULL,
  `generated_at`                     datetime(6) NOT NULL,

  PRIMARY KEY (`report_narrative_id`),

  -- One stored narrative per tag per respondent per computation. The service
  -- reads by this key before it considers calling anything.
  UNIQUE KEY `uqRnComputationAttemptTag`
    (`report_computation_id`, `respondent_assessment_mapping_id`, `tag`),
  KEY `idxRnAttempt` (`respondent_assessment_mapping_id`),

  -- Deleting a computation takes its narratives with it: they are prose ABOUT
  -- that computation's numbers and mean nothing without it. This is true
  -- composition, so it is the one cascade here.
  CONSTRAINT `fkRnComputation` FOREIGN KEY (`report_computation_id`)
    REFERENCES `report_computation` (`report_computation_id`) ON DELETE CASCADE,

  -- The attempt is NOT cascaded from. A re-attempt hard-deletes the answers
  -- behind a report, and a narrative whose attempt row went away is still
  -- evidence of what was written. It blocks instead, exactly like every other
  -- reference to a scored attempt.
  CONSTRAINT `fkRnAttempt` FOREIGN KEY (`respondent_assessment_mapping_id`)
    REFERENCES `respondent_assessment_mapping` (`respondent_assessment_mapping_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
