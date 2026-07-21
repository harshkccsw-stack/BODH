package com.bodhpsychometric.dto;

import java.util.List;

/**
 * Bulk assign/unassign payload for an organization: practitioners are its
 * staff, respondents its members. Assign only accepts unassigned people;
 * unassign only accepts people currently in that org — moving someone
 * between orgs goes through their own page. All-or-nothing either way.
 */
public record OrganizationAssignRequest(
        List<Long> practitionerIds,
        List<Long> respondentIds) {
}
