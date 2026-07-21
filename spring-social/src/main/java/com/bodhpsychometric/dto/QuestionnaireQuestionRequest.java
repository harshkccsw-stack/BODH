package com.bodhpsychometric.dto;

/**
 * One placement of the questionnaire's question mapping: this bank question,
 * in this section (null on flat questionnaires), at this position. The PUT
 * carries the full list — anything previously attached but absent is
 * detached back to the bank.
 */
public record QuestionnaireQuestionRequest(Long questionId, Long sectionId, Integer sortOrder) {
}
