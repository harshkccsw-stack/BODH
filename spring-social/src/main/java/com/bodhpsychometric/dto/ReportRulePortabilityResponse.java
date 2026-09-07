package com.bodhpsychometric.dto;

import java.util.List;

/**
 * Whether one library rule can be adopted onto one assessment — and, when it
 * can, whether doing so would quietly mean something different.
 *
 * <p>Three verdicts, because two is not enough. "Every column resolves" is the
 * check everyone expects and it is the one that misses the expensive case: a
 * rule whose keys all exist here but whose numbers do not run over the same
 * range they did where it was written. See {@code ReportShapeProbe}.
 *
 * @param verdict {@link #PORTABLE}, {@link #BLOCKED} or {@link #SHAPE_MISMATCH}
 * @param missingKeys the columns this assessment does not expose — populated for
 *        BLOCKED only, and named individually because "not portable" without
 *        saying what is missing is not an answer anyone can act on
 * @param warnings human sentences for SHAPE_MISMATCH, each naming the trait, the
 *        range it had where the rule was validated, and the range it has here
 * @param dependencySlugs the rules this one consumes, transitively. Adopting it
 *        adopts these too — a dependency left behind is a rule that reads a
 *        value nothing computes.
 */
public record ReportRulePortabilityResponse(
        Long reportRuleId,
        String name,
        String slug,
        String stage,
        int stepOrder,
        String definitionKind,
        Long homeAssessmentId,
        Long validatedAssessmentId,
        boolean population,
        String verdict,
        List<String> missingKeys,
        List<String> warnings,
        List<String> dependencySlugs) {

    /** Every column the rule and its dependencies name exists here. */
    public static final String PORTABLE = "PORTABLE";

    /** At least one column does not exist on this assessment. */
    public static final String BLOCKED = "BLOCKED";

    /** Everything resolves, but a referenced trait has a different range here. */
    public static final String SHAPE_MISMATCH = "SHAPE_MISMATCH";
}
