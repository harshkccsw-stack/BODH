package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.model.organization.Organization;

/**
 * The signed-in respondent as the portal consumes it, plus every assessment
 * attempt allotted to them — the portal home renders straight from this.
 */
public record PortalAuthResponse(
        Long userId,
        Long respondentUserId,
        String serialId,
        String email,
        /** Optional employer code — shown on the portal, and a login identifier. */
        String employeeId,
        String name,
        boolean isConsented,
        Long organizationId,
        String organizationName,
        /**
         * The organization's co-branding logo, for the portal header while an
         * assessment is being taken. Delivered HERE — once per session, on
         * login and on session restore — rather than with each assessment's
         * take payload: it belongs to the respondent's organization, not to
         * the assessment, so re-sending a base64 image with every attempt load
         * and every resume would ship the same bytes over and over.
         *
         * <p>Read live off the organization row, which also keeps it clear of
         * PortalQuestionnaireContent — that cache is shared between every
         * respondent taking a questionnaire, and a per-organization image has
         * no business in it.
         *
         * <p>Null for an unaffiliated respondent or an organization that set
         * none; the portal falls back to its own mark.
         */
        String organizationCoBrandLogoBase64,
        List<RespondentAssessmentResponse> allottedAssessments) {

    public static PortalAuthResponse from(RespondentUser respondent,
            List<RespondentAssessmentResponse> allottedAssessments) {
        User user = respondent.getUser();
        Organization organization = respondent.getOrganization();
        return new PortalAuthResponse(
                user.getId(),
                respondent.getId(),
                user.getSerialId(),
                user.getEmail(),
                respondent.getEmployeeId(),
                respondent.getName(),
                respondent.isConsented(),
                organization == null ? null : organization.getOrganizationId(),
                organization == null ? null : organization.getName(),
                organization == null ? null : organization.getCoBrandLogoBase64(),
                allottedAssessments);
    }
}
