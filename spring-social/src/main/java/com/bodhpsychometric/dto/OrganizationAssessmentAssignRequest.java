package com.bodhpsychometric.dto;

import java.util.List;

/**
 * Map/unmap assessments on an organization's catalog. All-or-nothing:
 * every id is validated before anything is written.
 */
public record OrganizationAssessmentAssignRequest(
        List<Long> assessmentIds) {
}
