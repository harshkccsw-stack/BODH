package com.bodhpsychometric.service.datastudio;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.DsDatasetResponse;
import com.bodhpsychometric.dto.DsDatasetResponse.Column;
import com.bodhpsychometric.dto.DsQueryRequest;
import com.bodhpsychometric.dto.DsQueryRequest.Filter;
import com.bodhpsychometric.dto.DsQueryRequest.Measure;
import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.model.datastudio.DsSheet;
import com.bodhpsychometric.security.RequestActor;
import com.bodhpsychometric.service.datastudio.expression.ExpressionEvaluator;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.Node;

/**
 * Grouped aggregation — every KPI tile, chart and pivot in Data Studio is one
 * call to this.
 *
 * <p>Rows come from a SHEET when {@code dsSheetId} is given, which is the
 * important case: the sheet's computed columns are already materialised, so a
 * chart can group by or measure a formula the analyst wrote. Given only
 * {@code sourceFilters} it falls back to the raw dataset, where those columns
 * do not exist — fine for an ad-hoc query, useless for charting a z-score,
 * which is exactly why the sheet path is the one the dashboard UI uses.
 *
 * <p>Filters are applied BEFORE grouping and before evaluation, so a
 * population function inside a measure aggregates over the filtered set and
 * not the whole assessment. That is the behaviour you want — "average z-score
 * among completed attempts" should z-score within that group — and it is worth
 * knowing it is a choice.
 *
 * <p>No dimensions means one group over everything: a KPI.
 */
@Service
@Transactional(readOnly = true)
public class DsQueryService {

    /** A chart with more categories than this is unreadable anyway. */
    private static final int MAX_LIMIT = 5000;

    private final DataStudioAccess access;
    private final DataStudioDatasetService datasets;
    private final DsSheetService sheetService;
    private final ExpressionService expressions;

    public DsQueryService(DataStudioAccess access,
            DataStudioDatasetService datasets,
            DsSheetService sheetService,
            ExpressionService expressions) {
        this.access = access;
        this.datasets = datasets;
        this.sheetService = sheetService;
        this.expressions = expressions;
    }

    public DsDatasetResponse query(DsQueryRequest request) {
        RequestActor actor = access.requireActor();
        if (request == null) {
            throw new IllegalArgumentException("A query body is required");
        }
        List<Measure> measures = request.measures() == null ? List.of() : request.measures();
        List<String> dimensions = request.dimensions() == null ? List.of() : request.dimensions();
        if (measures.isEmpty()) {
            throw new IllegalArgumentException("At least one measure is required");
        }

        DsDatasetResponse base = source(request, actor);

        // Validate dimensions and parse every measure BEFORE touching a row —
        // a typo should come back as a 400 naming the column, not as a chart
        // full of blanks that looks like missing data.
        Set<String> known = new HashSet<>();
        for (Column column : base.columns()) {
            known.add(column.key());
        }
        for (String dimension : dimensions) {
            if (!known.contains(dimension)) {
                throw new IllegalArgumentException("Unknown dimension column: " + dimension);
            }
        }
        List<Node> measureExprs = new ArrayList<>(measures.size());
        for (Measure measure : measures) {
            if (measure.expr() == null || measure.expr().isBlank()) {
                throw new IllegalArgumentException("Every measure needs an expr");
            }
            try {
                measureExprs.add(expressions.parse(measure.expr()));
            } catch (RuntimeException e) {
                throw new IllegalArgumentException("Invalid measure expression: " + e.getMessage());
            }
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> row : base.rows()) {
            if (passes(row, request.filters())) {
                rows.add(row);
            }
        }

        // One evaluator over the FILTERED population — see the class note.
        ExpressionEvaluator evaluator = new ExpressionEvaluator(rows);

        // Insertion-ordered so the output is stable between identical calls;
        // a chart whose bars reorder on refresh reads as a data change.
        Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        Map<String, List<Object>> groupValues = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            List<Object> values = new ArrayList<>(dimensions.size());
            StringBuilder signature = new StringBuilder();
            for (String dimension : dimensions) {
                Object value = row.get(dimension);
                values.add(value);
                // A NUL marks a null and SOH separates, so ("a", "b|c")
                // and ("a|b", "c") cannot collide into one group.
                signature.append(value == null ? "\u0000" : value.toString()).append('\u0001');
            }
            String key = dimensions.isEmpty() ? "*" : signature.toString();
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(row);
            groupValues.putIfAbsent(key, values);
        }

        List<Column> outColumns = new ArrayList<>();
        for (String dimension : dimensions) {
            outColumns.add(new Column(dimension, labelOf(base, dimension),
                    typeOf(base, dimension), "dimension"));
        }
        List<String> measureKeys = new ArrayList<>(measures.size());
        for (Measure measure : measures) {
            String key = measure.label() != null && !measure.label().isBlank()
                    ? measure.label()
                    : agg(measure) + "(" + measure.expr() + ")";
            measureKeys.add(key);
            outColumns.add(new Column(key, key, "number", "measure"));
        }

        List<Map<String, Object>> out = new ArrayList<>(groups.size());
        for (Map.Entry<String, List<Map<String, Object>>> group : groups.entrySet()) {
            Map<String, Object> outRow = new LinkedHashMap<>();
            List<Object> values = groupValues.get(group.getKey());
            for (int i = 0; i < dimensions.size(); i++) {
                outRow.put(dimensions.get(i), values.get(i));
            }
            for (int i = 0; i < measures.size(); i++) {
                double[] collected = collect(evaluator, measureExprs.get(i), group.getValue());
                outRow.put(measureKeys.get(i),
                        aggregate(agg(measures.get(i)), collected, group.getValue().size()));
            }
            out.add(outRow);
        }

        int limit = request.limit() == null ? MAX_LIMIT : Math.min(request.limit(), MAX_LIMIT);
        if (out.size() > limit) {
            out = out.subList(0, limit);
        }
        return new DsDatasetResponse("query", outColumns, out);
    }

    /* ---------------- source ---------------- */

    private DsDatasetResponse source(DsQueryRequest request, RequestActor actor) {
        if (request.dsSheetId() != null) {
            DsSheet sheet = sheetService.load(request.dsSheetId());
            // The access check is on the sheet's WORKBOOK, not on the query —
            // otherwise a widget id would be a way to read someone else's rows.
            access.requireRead(sheet.getWorkbook(), actor);
            return sheetService.compute(sheet);
        }
        Map<String, Object> filters = request.sourceFilters() == null
                ? Map.of()
                : request.sourceFilters();
        Long assessmentId = DsJson.longOf(filters, "assessmentId");
        if (assessmentId == null) {
            throw new IllegalArgumentException(
                    "Give a dsSheetId, or a sourceFilters.assessmentId to query directly");
        }
        return datasets.dataset(assessmentId, DsJson.longOf(filters, "organizationId"))
                .orElseThrow(() -> new NotFoundException("Assessment " + assessmentId + " not found"));
    }

    /* ---------------- filtering ---------------- */

    private boolean passes(Map<String, Object> row, List<Filter> filters) {
        if (filters == null) {
            return true;
        }
        for (Filter filter : filters) {
            if (filter == null || filter.colKey() == null || filter.op() == null) {
                continue;
            }
            if (!compare(row.get(filter.colKey()), filter.op(), filter.value())) {
                return false;
            }
        }
        return true;
    }

    /**
     * Numeric on both sides compares numerically, anything else compares as
     * text — so {@code core:status = "COMPLETED"} and {@code [demo:3] > 30}
     * both do the obvious thing without the caller declaring a type.
     */
    private boolean compare(Object cell, String op, Object value) {
        double a = ExpressionEvaluator.toNum(ExpressionEvaluator.coerce(cell));
        double b = ExpressionEvaluator.toNum(value);
        boolean numeric = !Double.isNaN(a) && !Double.isNaN(b);
        String cellText = ExpressionEvaluator.str(ExpressionEvaluator.coerce(cell));
        String valueText = value == null ? "" : String.valueOf(value);
        switch (op) {
            case "=":
            case "==":
                return numeric ? a == b : cellText.equals(valueText);
            case "!=":
            case "<>":
                return numeric ? a != b : !cellText.equals(valueText);
            case "<":
                return numeric ? a < b : cellText.compareTo(valueText) < 0;
            case "<=":
                return numeric ? a <= b : cellText.compareTo(valueText) <= 0;
            case ">":
                return numeric ? a > b : cellText.compareTo(valueText) > 0;
            case ">=":
                return numeric ? a >= b : cellText.compareTo(valueText) >= 0;
            case "contains":
                return cellText.toLowerCase(Locale.ROOT).contains(valueText.toLowerCase(Locale.ROOT));
            default:
                // An operator nobody implemented must not silently drop every
                // row; it lets them through and the chart looks unfiltered.
                return true;
        }
    }

    /* ---------------- aggregation ---------------- */

    private double[] collect(ExpressionEvaluator evaluator, Node expr, List<Map<String, Object>> rows) {
        List<Double> values = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            double value = ExpressionEvaluator.toNum(evaluator.eval(expr, row));
            if (!Double.isNaN(value)) {
                values.add(value);
            }
        }
        double[] out = new double[values.size()];
        for (int i = 0; i < out.length; i++) {
            out[i] = values.get(i);
        }
        return out;
    }

    /**
     * {@code count} counts ROWS in the group, blanks included; {@code countv}
     * counts only rows that produced a number. On this dataset the two differ
     * by exactly the unfinished attempts, which is usually the number someone
     * is actually asking for.
     */
    private Object aggregate(String agg, double[] values, int groupSize) {
        switch (agg) {
            case "count":
                return (double) groupSize;
            case "countv":
                return (double) values.length;
            case "sum":
                return finite(sum(values));
            case "min":
                return values.length == 0 ? null : finite(Arrays.stream(values).min().getAsDouble());
            case "max":
                return values.length == 0 ? null : finite(Arrays.stream(values).max().getAsDouble());
            case "median":
            case "p50":
                return percentile(values, 50);
            case "p25":
                return percentile(values, 25);
            case "p75":
                return percentile(values, 75);
            case "avg":
            default:
                return values.length == 0 ? null : finite(sum(values) / values.length);
        }
    }

    private static double sum(double[] values) {
        double total = 0;
        for (double value : values) {
            total += value;
        }
        return total;
    }

    /** Linear interpolation between the two ranks a percentile falls between. */
    private static Object percentile(double[] values, double p) {
        if (values.length == 0) {
            return null;
        }
        double[] sorted = values.clone();
        Arrays.sort(sorted);
        double fraction = Math.max(0, Math.min(100, p)) / 100.0;
        double rank = fraction * (sorted.length - 1);
        int low = (int) Math.floor(rank);
        int high = (int) Math.ceil(rank);
        return low == high ? sorted[low] : sorted[low] + (rank - low) * (sorted[high] - sorted[low]);
    }

    /** NaN and infinity become null — JSON has no way to say either. */
    private static Object finite(double value) {
        return Double.isFinite(value) ? value : null;
    }

    private static String agg(Measure measure) {
        return measure.agg() == null || measure.agg().isBlank()
                ? "avg"
                : measure.agg().toLowerCase(Locale.ROOT);
    }

    private String labelOf(DsDatasetResponse base, String key) {
        for (Column column : base.columns()) {
            if (column.key().equals(key)) {
                return column.label();
            }
        }
        return key;
    }

    private String typeOf(DsDatasetResponse base, String key) {
        for (Column column : base.columns()) {
            if (column.key().equals(key)) {
                return column.type();
            }
        }
        return "string";
    }
}
