package com.bodhpsychometric.model.assessment.enums;

/**
 * How the portal pages an assessment's questions:
 * ONE_PER_PAGE — one question per screen, Next/Previous between them (the
 * original behaviour, and the default); SECTION_PER_PAGE — every question of
 * a section on one scrollable page, Next/Back between sections. A flat
 * questionnaire has one implicit section, so it becomes a single page.
 *
 * Presentation only: the submit validator checks the whole answer set the
 * same way whichever layout delivered it. Auto-advance applies to
 * ONE_PER_PAGE alone — sliding a page away mid-section is not a thing.
 *
 * Stored as a MySQL ENUM (V41): new values go at the END of this list.
 */
public enum QuestionLayout {
    ONE_PER_PAGE,
    SECTION_PER_PAGE
}
