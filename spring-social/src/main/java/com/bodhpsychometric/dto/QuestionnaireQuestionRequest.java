package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotNull;

/**
 * One placement of the questionnaire's question mapping: this bank question,
 * in this section (null on flat questionnaires), at this position. The PUT
 * carries the full list — anything previously attached but absent is
 * detached back to the bank.
 *
 * optional: may the respondent leave it blank? NULL means UNCHANGED — the
 * placement keeps the flag it already had, and a question new to the
 * questionnaire starts required. The PUT deletes and re-creates every
 * placement, so a caller that does not know about the flag (an upload, an
 * older screen) must not be able to reset it by leaving it out.
 */
public record QuestionnaireQuestionRequest(
        @NotNull(message = "questionId is required") Long questionId,
        Long sectionId,
        Integer sortOrder,
        Boolean optional) {
}
