package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.auth.enums.Vertical;
import com.bodhpsychometric.model.questionnaire.Questionnaire;

/**
 * Catalog view of a questionnaire. questionCount walks the lazy questions
 * collection — callers must build this inside a transaction.
 */
public record QuestionnaireResponse(
        Long questionnaireId,
        String name,
        String shortName,
        String category,
        Vertical vertical,
        String description,
        Integer durationMinutes,
        String generalInstruction,
        boolean hasSections,
        int questionCount) {

    public static QuestionnaireResponse from(Questionnaire q) {
        return new QuestionnaireResponse(
                q.getQuestionnaireId(),
                q.getName(),
                q.getShortName(),
                q.getCategory(),
                q.getVertical(),
                q.getDescription(),
                q.getDurationMinutes(),
                q.getGeneralInstruction(),
                q.isHasSections(),
                q.getQuestions().size());
    }
}
