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
        String name,
        boolean isConsented,
        Long organizationId,
        String organizationName,
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
                respondent.getName(),
                respondent.isConsented(),
                organization == null ? null : organization.getOrganizationId(),
                organization == null ? null : organization.getName(),
                allottedAssessments);
    }
}
