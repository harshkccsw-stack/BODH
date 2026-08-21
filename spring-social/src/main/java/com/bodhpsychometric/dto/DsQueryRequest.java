package com.bodhpsychometric.dto;

import java.util.List;
import java.util.Map;

/**
 * A grouped aggregation — the engine behind every KPI tile, chart and pivot.
 *
 * <p>Two ways to say where the rows come from, and the first is the one to
 * use: give a {@code dsSheetId} and the query runs over that SHEET, meaning
 * its assessment binding and every one of its computed columns are already
 * there to group by and measure. Without it, {@code sourceFilters} names the
 * assessment directly and only the raw dataset columns exist — useful for an
 * ad-hoc query, useless for charting a formula.
 *
 * <p>No dimensions means one group over everything, which is exactly what a
 * KPI tile wants.
 */
public record DsQueryRequest(
        /** Preferred: run over this sheet, computed columns included. */
        Long dsSheetId,
        String sourceView,
        /** Used only when dsSheetId is absent: {"assessmentId": .., "organizationId": ..}. */
        Map<String, Object> sourceFilters,
        List<String> dimensions,
        List<Measure> measures,
        List<Filter> filters,
        Integer limit) {

    /**
     * One output number per group. {@code expr} is a formula in the same
     * grammar as a computed column — usually a bare column reference like
     * {@code [mqt:14]}, but any expression works — and {@code agg} is how the
     * group's values collapse into one: sum | avg | count | countv | min | max
     * | median | p25 | p50 | p75. Defaults to avg.
     *
     * <p>{@code count} counts ROWS in the group, blanks included; {@code countv}
     * counts only the rows where the expression produced a number. The two
     * differ exactly when an attempt has not been completed, which is the case
     * you most often want to see.
     */
    public record Measure(String expr, String agg, String label) {
    }

    /**
     * A row filter applied before grouping. {@code op} is one of = != &lt;
     * &lt;= &gt; &gt;= contains. Numeric on both sides compares numerically,
     * anything else compares as text.
     */
    public record Filter(String colKey, String op, Object value) {
    }
}
