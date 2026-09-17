package com.bodhpsychometric.dto;

import java.util.List;

/**
 * The full pre-approval check for one computation, run on demand.
 *
 * <p>Split from {@link ReportComputationResponse#directBlockers()} because the
 * last step of the check — evaluating every pinned rule over the whole cohort
 * — is the expensive one, and it used to run on every read of every
 * computation, the list included. The read now carries only the cheap
 * blockers; this carries the rest, and the screen asks for it after every
 * change and before the approve button is enabled.
 *
 * @param blockers      everything still standing between this and delivery;
 *                      empty means approve will succeed right now
 * @param cohortSize    every allotted attempt the rules ran over
 * @param completed     how many of those are COMPLETED — the number a
 *                      cohort-relative rule is judged against
 * @param minCohortSize the installation's threshold for those rules
 * @param rules         per-rule outcome and distribution, as the dry run
 *                      reports them; empty when a cheaper blocker stopped the
 *                      evaluation from running
 */
public record ReportCheckResponse(
        Long reportComputationId,
        List<String> blockers,
        int cohortSize,
        int completed,
        int minCohortSize,
        List<ReportDryRunResponse.RuleOutcome> rules,
        List<String> notes) {

    public boolean isReady() {
        return blockers.isEmpty();
    }
}
