package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.auth.RespondentUser;

/** One attempt row, flattened for the assignment views. */
public record RespondentAssessmentResponse(
        Long respondentAssessmentMappingId,
        Long respondentUserId,
        String respondentName,
        String respondentEmail,
        String serialId,
        Long organizationId,
        String organizationName,
        Long assessmentId,
        String assessmentName,
        int attemptNumber,
        RespondentAssessmentStatus assessmentStatus) {

    public static RespondentAssessmentResponse from(RespondentAssessmentMapping mapping) {
        RespondentUser respondent = mapping.getRespondent();
        return new RespondentAssessmentResponse(
                mapping.getRespondentAssessmentMappingId(),
                respondent.getId(),
                respondent.getName(),
                respondent.getUser().getEmail(),
                respondent.getUser().getSerialId(),
                respondent.getOrganization() == null ? null
                        : respondent.getOrganization().getOrganizationId(),
                respondent.getOrganization() == null ? null
                        : respondent.getOrganization().getName(),
                mapping.getAssessment().getAssessmentId(),
                mapping.getAssessment().getName(),
                mapping.getAttemptNumber(),
                mapping.getAssessmentStatus());
    }
}
