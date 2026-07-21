package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.auth.enums.Vertical;
import com.bodhpsychometric.model.questionnaire.Questionnaire;

/**
 * Catalog view of a questionnaire. questionCount is the number of
 * QuestionnaireQuestion placements — the caller counts via repository, since
 * the entity holds no questions collection anymore.
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

    public static QuestionnaireResponse from(Questionnaire q, int questionCount) {
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
                questionCount);
    }
}
