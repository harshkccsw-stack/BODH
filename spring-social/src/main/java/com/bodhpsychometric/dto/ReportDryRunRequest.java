package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotNull;

/**
 * Run the selected rules over real respondents, here, now — no AI, no sandbox.
 *
 * @param ruleIds the rules to evaluate. Empty means every ACTIVE rule homed on
 *        this assessment. Dependencies are added automatically either way: a
 *        rule evaluated without the rules it consumes has no value at all, so
 *        asking for one and leaving its inputs out is never what was meant.
 * @param rowLimit how many respondent rows to return. Summaries are computed
 *        over the WHOLE cohort regardless — the distribution is the point, and
 *        a summary over the first 25 rows would be a different number wearing
 *        the same label.
 */
public record ReportDryRunRequest(

        @NotNull(message = "Choose the assessment to run against")
        Long assessmentId,

        Long organizationId,

        List<Long> ruleIds,

        Integer rowLimit) {
}
