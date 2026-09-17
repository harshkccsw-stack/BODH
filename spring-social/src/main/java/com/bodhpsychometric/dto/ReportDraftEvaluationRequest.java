package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotNull;

/**
 * Run formulae that are NOT saved over the real cohort — "try it before
 * accepting".
 *
 * <p>A draft may read saved rules by {@code [rule:slug]} and other drafts in
 * the same list. A draft whose slug matches a saved rule stands in for it, so a
 * proposed re-translation is evaluated in place of the version on file.
 */
public record ReportDraftEvaluationRequest(

        @NotNull(message = "Choose the assessment to run against")
        Long assessmentId,

        Long organizationId,

        @NotNull(message = "Give at least one formula to run")
        List<Draft> drafts,

        Integer rowLimit) {

    public record Draft(String slug, String expression) {
    }
}
