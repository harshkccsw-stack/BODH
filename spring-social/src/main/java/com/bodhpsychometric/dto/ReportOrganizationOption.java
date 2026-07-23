package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.organization.Organization;

/** One row of the report page's organization dropdown. */
public record ReportOrganizationOption(Long organizationId, String name) {

    public static ReportOrganizationOption from(Organization organization) {
        return new ReportOrganizationOption(organization.getOrganizationId(), organization.getName());
    }
}
