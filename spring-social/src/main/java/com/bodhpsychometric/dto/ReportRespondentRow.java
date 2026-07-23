package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.auth.RespondentUser;

/**
 * One respondent line of the report listing. The attempt tallies are scoped
 * by the request's assessment filter: with an assessmentId they count that
 * assessment's attempts only, without one they count across all assessments.
 */
public record ReportRespondentRow(
        Long respondentUserId,
        String serialId,
        String name,
        String email,
        String phone,
        Long organizationId,
        String organizationName,
        long totalAttempts,
        long completedAttempts) {

    public static ReportRespondentRow from(RespondentUser respondent,
            long totalAttempts, long completedAttempts) {
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
                totalAttempts,
                completedAttempts);
    }
}
