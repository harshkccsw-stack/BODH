package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.model.assessment.Assessment;

/**
 * Everything MemoryMesh needs to rebuild this assessment on its side: the
 * run's configuration, and the questionnaire flattened exactly as the portal
 * receives it — sections, questions, options, rows.
 */
public record MemoryMeshAssessmentDetail(
        MemoryMeshAssessmentSummary assessment,
        boolean showTermsAndConditions,
        String termsAndConditions,
        boolean autoNext,
        boolean showQuestionIndex,
        boolean attentionTimer,
        boolean savePartialAnswers,
        LocalDate startDate,
        LocalDate endDate,
        PortalQuestionnaireContent content) {

    public static MemoryMeshAssessmentDetail from(Assessment a, PortalQuestionnaireContent content) {
        return new MemoryMeshAssessmentDetail(
                MemoryMeshAssessmentSummary.from(a, content.questions().size()),
                a.isShowTermsAndConditions(), a.getTermsAndConditions(),
                a.isAutoNext(), a.isShowQuestionIndex(), a.isAttentionTimer(), a.isSavePartialAnswers(),
                a.getStartDate(), a.getEndDate(), content);
    }
}
