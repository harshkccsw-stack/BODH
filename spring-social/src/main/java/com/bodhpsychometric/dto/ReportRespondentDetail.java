package com.bodhpsychometric.dto;

import java.time.OffsetDateTime;
import java.util.List;

import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.enums.Gender;

/**
 * Everything the report listing's info popup renders for one respondent: the
 * profile line the listing already shows, plus every assessment allotted to
 * them with its progress. One allotment per (respondent, assessment) pair, so
 * the list has one entry per assessment, not per attempt.
 */
public record ReportRespondentDetail(
        Long respondentUserId,
        String serialId,
        String name,
        String email,
        String phone,
        Gender gender,
        boolean consented,
        OffsetDateTime consentedAt,
        Long organizationId,
        String organizationName,
        List<ReportRespondentAssessmentRow> assessments) {

    public static ReportRespondentDetail from(RespondentUser respondent,
            List<ReportRespondentAssessmentRow> assessments) {
        return new ReportRespondentDetail(
                respondent.getId(),
                respondent.getUser().getSerialId(),
                respondent.getName(),
                respondent.getUser().getEmail(),
                // Joined, so a report still shows a complete number now that
                // the country code lives in its own column.
                respondent.displayPhone(),
                respondent.getGender(),
                respondent.isConsented(),
                respondent.getConsentedAt(),
                respondent.getOrganization() == null ? null
                        : respondent.getOrganization().getOrganizationId(),
                respondent.getOrganization() == null ? null
                        : respondent.getOrganization().getName(),
                assessments);
    }
}
