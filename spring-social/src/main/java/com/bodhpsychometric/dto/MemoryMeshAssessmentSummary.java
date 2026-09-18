package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;

/** An assessment as MemoryMesh's import picker lists it. */
public record MemoryMeshAssessmentSummary(
        Long assessmentId,
        String name,
        AssessmentStatus status,
        Long questionnaireId,
        String questionnaireName,
        boolean hasSections,
        int questionCount) {

    public static MemoryMeshAssessmentSummary from(Assessment a, int questionCount) {
        return new MemoryMeshAssessmentSummary(
                a.getAssessmentId(), a.getName(), a.getStatus(),
                a.getQuestionnaire().getQuestionnaireId(), a.getQuestionnaire().getName(),
                a.getQuestionnaire().isHasSections(), questionCount);
    }
}
