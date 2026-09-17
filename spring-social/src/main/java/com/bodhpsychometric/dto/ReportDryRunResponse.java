package com.bodhpsychometric.dto;

import java.util.List;
import java.util.Map;

/**
 * What the selected rules actually compute, for real respondents.
 *
 * <h2>What this is, and firmly what it is not</h2>
 *
 * <p>This is the workbook's Sample_Calculator tab, inside the product: it
 * proves the rules were transcribed correctly and shows what they do to a real
 * cohort, with no model and no sandbox involved.
 *
 * <p>It is <b>not the delivery path</b>. Reports are produced by generated
 * Python executed in the sandbox; this evaluates the expression grammar in
 * Java. The two are separate implementations on purpose — that is exactly what
 * makes this useful as an acceptance oracle later — and it is also why nothing
 * here may ever mark a computation approved. If a dry run could approve, the
 * two implementations would quietly become one, and the checked artifact would
 * be the one nobody ships.
 *
 * @param rules one entry per rule, in the order they were evaluated, which is
 *        dependency order and not the order they were asked for
 * @param rows a capped sample; {@code respondentCount} is the real cohort size
 */
public record ReportDryRunResponse(
        Long assessmentId,
        int respondentCount,
        int rowsReturned,
        List<RuleOutcome> rules,
        List<Row> rows,
        List<String> notes) {

    /** Evaluated cleanly. */
    public static final String EVALUATED = "EVALUATED";

    /** A plain-language rule: nothing here can compute it, and pretending
     *  otherwise would print a blank where a judgement belongs. */
    public static final String NEEDS_GENERATION = "NEEDS_GENERATION";

    /** The rule, or something it depends on, could not be evaluated. */
    public static final String ERROR = "ERROR";

    /**
     * A cohort-relative rule over fewer completed respondents than the
     * minimum. Nothing was computed: a z-score over three people, or a
     * percentile over one, is a number that looks like a norm and is not.
     */
    public static final String TOO_SMALL = "TOO_SMALL";

    public record RuleOutcome(
            Long reportRuleId,
            String slug,
            String name,
            String stage,
            String definitionKind,
            String resultType,
            boolean population,
            String status,
            String error,
            Summary summary) {
    }

    /**
     * The cohort view of one rule — the thing no single sample report shows.
     *
     * <p>A band cut written backwards produces a perfectly plausible PDF for
     * every respondent it is wrong about. It produces a visibly absurd
     * histogram the moment you look at all of them at once, which is the only
     * reason this is here.
     *
     * @param nulls how many respondents the rule produced nothing for. Never
     *        collapse this into zero: "no value" and "a score of zero" are
     *        different answers and only one of them is a defect.
     * @param bands value → count, for rules returning a term
     */
    public record Summary(
            int count,
            int nulls,
            Double min,
            Double max,
            Double mean,
            Map<String, Integer> bands) {
    }

    /** One respondent. {@code values} is keyed by rule slug. */
    public record Row(
            Object rowId,
            String label,
            Map<String, Object> values) {
    }
}
