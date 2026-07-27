-- BodhAssess — collapse attempts, reparent responses to (respondent, assessment)
--
-- Run this ONCE per environment, BEFORE starting the app with this build.
-- ddl-auto:update adds the new columns but never backfills them and never
-- drops the old ones, so an un-migrated database holding data will fail on
-- the NOT NULL inserts.
--
--   mysql -h<host> -P<port> -u<user> -p <schema> < 2026-07-27-one-allotment-per-pair.sql
--
-- !! TAKE A BACKUP FIRST. MySQL commits each DDL statement implicitly, so
-- !! this script is NOT atomic — a failure halfway leaves the schema
-- !! part-migrated and you will need the dump to get back.
--
-- What changes:
--   1. assessment_answer     — parent moves from the attempt row to
--                              (respondent_user_id, assessment_id).
--   2. demographic_response  — same move, so a respondent holds one
--                              demographic set per assessment.
--   3. respondent_assessment_mapping — attempt_number is gone; exactly one
--                              allotment per (respondent, assessment).
--
-- Table names are the physical snake_case ones Hibernate's default naming
-- strategy produces; index and constraint names are the explicit camelCase
-- ones from the entity annotations.

-- ── Pre-flight ───────────────────────────────────────────────────────────
-- Must return ZERO rows. Any pair with more than one attempt row is real
-- re-attempt history: decide which one survives and delete the others
-- (with their answers/demographics) BEFORE running the rest of this file,
-- or step 3 will fail on the new unique key.
SELECT respondent_user_id, assessment_id, COUNT(*) AS attempts
FROM respondent_assessment_mapping
GROUP BY respondent_user_id, assessment_id
HAVING attempts > 1;

-- ── 1. assessment_answer → (respondent, assessment) ──────────────────────
ALTER TABLE assessment_answer
  ADD COLUMN respondent_user_id bigint NULL,
  ADD COLUMN assessment_id      bigint NULL;

UPDATE assessment_answer aa
  JOIN respondent_assessment_mapping m
    ON aa.respondent_assessment_mapping_id = m.respondent_assessment_mapping_id
  SET aa.respondent_user_id = m.respondent_user_id,
      aa.assessment_id      = m.assessment_id;

ALTER TABLE assessment_answer
  MODIFY respondent_user_id bigint NOT NULL,
  MODIFY assessment_id      bigint NOT NULL;

ALTER TABLE assessment_answer DROP FOREIGN KEY fkAaMapping;
ALTER TABLE assessment_answer DROP INDEX uqAaMappingQuestionOption;
ALTER TABLE assessment_answer DROP COLUMN respondent_assessment_mapping_id;

ALTER TABLE assessment_answer
  ADD CONSTRAINT uqAaRespondentAssessmentQuestionOption
      UNIQUE (respondent_user_id, assessment_id, question_id, option_id),
  ADD KEY idxAaAssessment (assessment_id),
  ADD CONSTRAINT fkAaRespondent FOREIGN KEY (respondent_user_id) REFERENCES respondent_user (id),
  ADD CONSTRAINT fkAaAssessment FOREIGN KEY (assessment_id)      REFERENCES assessment (assessment_id);

-- ── 2. demographic_response → (respondent, assessment) ───────────────────
ALTER TABLE demographic_response
  ADD COLUMN respondent_user_id bigint NULL,
  ADD COLUMN assessment_id      bigint NULL;

UPDATE demographic_response dr
  JOIN respondent_assessment_mapping m
    ON dr.respondent_assessment_mapping_id = m.respondent_assessment_mapping_id
  SET dr.respondent_user_id = m.respondent_user_id,
      dr.assessment_id      = m.assessment_id;

ALTER TABLE demographic_response
  MODIFY respondent_user_id bigint NOT NULL,
  MODIFY assessment_id      bigint NOT NULL;

ALTER TABLE demographic_response DROP FOREIGN KEY fkDrMapping;
ALTER TABLE demographic_response DROP INDEX uqDrMappingField;
ALTER TABLE demographic_response DROP COLUMN respondent_assessment_mapping_id;

ALTER TABLE demographic_response
  ADD CONSTRAINT uqDrRespondentAssessmentField
      UNIQUE (respondent_user_id, assessment_id, demographic_field_id),
  ADD KEY idxDrAssessment (assessment_id),
  ADD CONSTRAINT fkDrRespondent FOREIGN KEY (respondent_user_id) REFERENCES respondent_user (id),
  ADD CONSTRAINT fkDrAssessment FOREIGN KEY (assessment_id)      REFERENCES assessment (assessment_id);

-- ── 3. respondent_assessment_mapping — one allotment per pair ────────────
-- Add the new key BEFORE dropping the old one: fkRamRespondent leans on
-- uqRamRespondentAssessmentAttempt for its index (respondent_user_id is the
-- leftmost column), so dropping it first fails with errno 1553. The new key
-- covers the same prefix, which lets the old one go.
ALTER TABLE respondent_assessment_mapping
  ADD CONSTRAINT uqRamRespondentAssessment UNIQUE (respondent_user_id, assessment_id);
ALTER TABLE respondent_assessment_mapping DROP INDEX uqRamRespondentAssessmentAttempt;
ALTER TABLE respondent_assessment_mapping DROP COLUMN attempt_number;

-- A COMPLETED allotment's answers are already in SQL, so the durability flag
-- is true for them by definition. Everything else stays 0.
UPDATE respondent_assessment_mapping
   SET is_persisted = 1
 WHERE assessment_status = 'COMPLETED';
