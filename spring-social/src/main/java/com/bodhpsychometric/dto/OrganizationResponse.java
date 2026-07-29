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
                staffCount,
                memberCount,
                assessmentCount);
    }
}
