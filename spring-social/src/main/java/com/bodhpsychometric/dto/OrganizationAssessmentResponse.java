package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.OrganizationAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;

/**
 * One entry of an organization's assessment catalog.
 * assignedMemberCount = attempt rows by THIS org's members.
 */
public record OrganizationAssessmentResponse(
        Long assessmentId,
        String name,
        Long questionnaireId,
        String questionnaireName,
        AssessmentStatus status,
        long assignedMemberCount) {

    public static OrganizationAssessmentResponse from(OrganizationAssessmentMapping mapping,
            long assignedMemberCount) {
        return new OrganizationAssessmentResponse(
                mapping.getAssessment().getAssessmentId(),
                mapping.getAssessment().getName(),
                mapping.getAssessment().getQuestionnaire().getQuestionnaireId(),
                mapping.getAssessment().getQuestionnaire().getName(),
                mapping.getAssessment().getStatus(),
                assignedMemberCount);
    }
}
