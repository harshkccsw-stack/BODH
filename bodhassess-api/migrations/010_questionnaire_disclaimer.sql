-- 010_questionnaire_disclaimer.sql
-- Optional disclaimer / terms-and-conditions text shown to respondents before
-- they start an assessment. If NULL or empty, the take page skips straight to
-- the first question.

ALTER TABLE published_questionnaires
    ADD COLUMN IF NOT EXISTS disclaimer TEXT;
