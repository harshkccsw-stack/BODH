package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.auth.RespondentUser;

/**
 * One allotment row, flattened for the assignment views.
 *
 * <p>{@code submissionPending} — a submission is staged in Redis but the
 * digest has not landed it in MySQL yet (status still ONGOING, isPersisted
 * false). Only the PORTAL's listing computes it (one Redis check per row, see
 * PortalAuthService); the dashboard's assignment views use the plain
 * {@code from} and always report false rather than pay that check per row.
 */
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
        RespondentAssessmentStatus assessmentStatus,
        boolean isPersisted,
        boolean submissionPending) {

    public static RespondentAssessmentResponse from(RespondentAssessmentMapping mapping) {
        return from(mapping, false);
    }

    public static RespondentAssessmentResponse from(RespondentAssessmentMapping mapping,
            boolean submissionPending) {
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
                mapping.getAssessmentStatus(),
                mapping.isPersisted(),
                submissionPending);
    }
}
