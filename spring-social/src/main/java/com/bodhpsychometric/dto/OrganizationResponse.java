package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.organization.Organization;

/**
 * Listing shape for the organizations page and the member-form pickers.
 * staffCount = practitioners, memberCount = respondents,
 * assessmentCount = catalog entries (OrganizationAssessmentMapping rows).
 */
public record OrganizationResponse(
        Long organizationId,
        String name,
        String orgEmail,
        String description,
        String logoBase64,
        /** The portal's take-flow header logo; null when the org set none. */
        String coBrandLogoBase64,
        long staffCount,
        long memberCount,
        long assessmentCount) {

    public static OrganizationResponse from(Organization organization,
            long staffCount, long memberCount, long assessmentCount) {
        return new OrganizationResponse(
                organization.getOrganizationId(),
                organization.getName(),
                organization.getOrgEmail(),
                organization.getDescription(),
                organization.getLogoBase64(),
                organization.getCoBrandLogoBase64(),
                staffCount,
                memberCount,
                assessmentCount);
    }
}
