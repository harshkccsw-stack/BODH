package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.organization.Organization;

/**
 * Listing shape for the organizations page and the member-form pickers.
 * staffCount = practitioners in the org, memberCount = respondents.
 */
public record OrganizationResponse(
        Long organizationId,
        String name,
        String orgEmail,
        String description,
        long staffCount,
        long memberCount) {

    public static OrganizationResponse from(Organization organization,
            long staffCount, long memberCount) {
        return new OrganizationResponse(
                organization.getOrganizationId(),
                organization.getName(),
                organization.getOrgEmail(),
                organization.getDescription(),
                staffCount,
                memberCount);
    }
}
