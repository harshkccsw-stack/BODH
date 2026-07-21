package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

/**
 * Assign one assessment to respondents (bulk = many ids, single = one).
 * All-or-nothing. Rule: a respondent WITH an organization may only receive
 * assessments mapped to that organization; a respondent WITHOUT one may be
 * assigned directly (the Assessment Mapping page's flow).
 */
public record RespondentAssessmentAssignRequest(
        @NotNull(message = "assessmentId is required") Long assessmentId,
        @NotEmpty(message = "Pick at least one respondent") List<Long> respondentUserIds) {
}
