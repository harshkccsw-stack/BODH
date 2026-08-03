package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;

/**
 * Catalog view of an assessment. questionnaireName is denormalized for list
 * rendering; respondentCount is the number of attempt rows — the caller
 * counts via repository so the entity stays collection-free.
 */
public record AssessmentResponse(
        Long assessmentId,
        String name,
        Long questionnaireId,
        String questionnaireName,
        boolean showTermsAndConditions,
        AssessmentStatus status,
        boolean autoNext,
        boolean showQuestionIndex,
        int respondentCount) {

    public static AssessmentResponse from(Assessment a, int respondentCount) {
        return new AssessmentResponse(
                a.getAssessmentId(),
                a.getName(),
                a.getQuestionnaire().getQuestionnaireId(),
                a.getQuestionnaire().getName(),
                a.isShowTermsAndConditions(),
                a.getStatus(),
                a.isAutoNext(),
                a.isShowQuestionIndex(),
                respondentCount);
    }
}
