package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.organization.Organization;

/** Listing shape for organization pickers (respondent/practitioner forms). */
public record OrganizationResponse(
        Long organizationId,
        String name,
        String description) {

    public static OrganizationResponse from(Organization organization) {
        return new OrganizationResponse(
                organization.getOrganizationId(),
                organization.getName(),
                organization.getDescription());
    }
}
