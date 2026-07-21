package com.bodhpsychometric.dto;

import java.util.List;

/**
 * Bulk-assign payload for an organization: practitioners become its staff,
 * respondents its members. Only unassigned people are accepted — moving
 * someone between orgs goes through their own page. All-or-nothing.
 */
public record OrganizationAssignRequest(
        List<Long> practitionerIds,
        List<Long> respondentIds) {
}
