package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.auth.RespondentUser;

/**
 * One respondent line of the report listing. The tallies are scoped by the
 * request's assessment filter: with an assessmentId they describe that one
 * assessment, without one they count across every assessment the respondent
 * holds. One allotment per (respondent, assessment) pair, so these count
 * assessments, not attempts.
 */
public record ReportRespondentRow(
        Long respondentUserId,
        String serialId,
        String name,
        String email,
        String phone,
        Long organizationId,
        String organizationName,
        long assignedAssessments,
        long completedAssessments) {

    public static ReportRespondentRow from(RespondentUser respondent,
            long assignedAssessments, long completedAssessments) {
        return new ReportRespondentRow(
                respondent.getId(),
                respondent.getUser().getSerialId(),
                respondent.getName(),
                respondent.getUser().getEmail(),
                respondent.getPhone(),
                respondent.getOrganization() == null ? null
                        : respondent.getOrganization().getOrganizationId(),
                respondent.getOrganization() == null ? null
                        : respondent.getOrganization().getName(),
                assignedAssessments,
                completedAssessments);
    }
}
