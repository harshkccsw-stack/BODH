package com.bodhpsychometric.bodhassess.analytics.service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionEvaluator;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.Node;
import com.bodhpsychometric.bodhassess.analytics.payload.AnalyticsQueryRequest;
import com.bodhpsychometric.bodhassess.analytics.payload.AnalyticsQueryRequest.Filter;
import com.bodhpsychometric.bodhassess.analytics.payload.AnalyticsQueryRequest.Measure;
import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.payload.DatasetColumnDto;
import com.bodhpsychometric.bodhassess.payload.DatasetResponseDto;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;
import com.bodhpsychometric.bodhassess.service.DatasetService;

/**
 * Grouped aggregation over a dataset view — the engine behind KPI tiles, pivot
 * tables, and charts. Rows are pulled live from {@link DatasetService}, filtered,
 * grouped by the requested dimensions, and each measure is the chosen aggregate
 * of an expression evaluated per row (population functions in the expression see
 * the full filtered set). With no dimensions the whole set is one group (a KPI).
 */
@Service
@Transactional(readOnly = true)
public class QueryService {

    private static final int MAX_LIMIT = 5000;

    @Autowired private DataStudioAccess access;
    @Autowired private ExpressionService expressions;
    @Autowired private DatasetService datasets;

    public DatasetResponseDto query(UserPrincipal principal, AnalyticsQueryRequest req) {
        access.requireExpert(principal);
        if (req == null) throw new BadRequestException("query body is required");
        List<Measure> measures = req.getMeasures() == null ? List.of() : req.getMeasures();
        List<String> dimensions = req.getDimensions() == null ? List.of() : req.getDimensions();
        if (measures.isEmpty()) throw new BadRequestException("at least one measure is required");

        Map<String, Object> filters = req.getSourceFilters() == null ? Map.of() : req.getSourceFilters();
        String assessmentId = str(filters.get("assessmentId"));
        if (assessmentId == null) assessmentId = str(filters.get("questionnaireId"));
        DatasetResponseDto base = datasets.sessions(
                principal, str(filters.get("entityId")), assessmentId);

        // Validate dimensions / parse measure expressions up front.
        java.util.Set<String> known = new java.util.HashSet<>();
        for (DatasetColumnDto c : base.getColumns()) known.add(c.getKey());
        for (String d : dimensions) {
            if (!known.contains(d)) throw new BadRequestException("Unknown dimension column: " + d);
        }
        List<Node> measureExprs = new ArrayList<>();
        for (Measure m : measures) {
            if (!StringUtils.hasText(m.getExpr())) throw new BadRequestException("measure.expr is required");
            try {
                measureExprs.add(expressions.parse(m.getExpr()));
            } catch (RuntimeException ex) {
                throw new BadRequestException("Invalid measure expression: " + ex.getMessage());
            }
        }

        // Filter rows.
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> r : base.getRows()) {
            if (passesFilters(r, req.getFilters())) rows.add(r);
        }

        // One evaluator over the filtered population so population functions in
        // measure expressions aggregate across all matching rows.
        ExpressionEvaluator evaluator = new ExpressionEvaluator(rows);

        // Group by dimension tuple (insertion-ordered for stable output).
        Map<String, List<Map<String, Object>>> groups = new LinkedHashMap<>();
        Map<String, List<Object>> groupKeyValues = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            List<Object> keyVals = new ArrayList<>(dimensions.size());
            StringBuilder sig = new StringBuilder();
            for (String d : dimensions) {
                Object v = r.get(d);
                keyVals.add(v);
                sig.append(v == null ? "\u0000" : v.toString()).append("\u0001");
            }
            String sigKey = dimensions.isEmpty() ? "*" : sig.toString();
            groups.computeIfAbsent(sigKey, k -> new ArrayList<>()).add(r);
            groupKeyValues.putIfAbsent(sigKey, keyVals);
        }

        // Build columns: dimensions first, then measures.
        List<DatasetColumnDto> columns = new ArrayList<>();
        for (String d : dimensions) {
            columns.add(new DatasetColumnDto(d, labelFor(base, d), typeFor(base, d), "dimension"));
        }
        List<String> measureKeys = new ArrayList<>();
        for (Measure m : measures) {
            String key = StringUtils.hasText(m.getLabel())
                    ? m.getLabel()
                    : (agg(m) + "(" + m.getExpr() + ")");
            measureKeys.add(key);
            columns.add(new DatasetColumnDto(key, key, "number", "measure"));
        }

        // Aggregate each group.
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> g : groups.entrySet()) {
            Map<String, Object> outRow = new LinkedHashMap<>();
            List<Object> keyVals = groupKeyValues.get(g.getKey());
            for (int i = 0; i < dimensions.size(); i++) outRow.put(dimensions.get(i), keyVals.get(i));
            for (int i = 0; i < measures.size(); i++) {
                double[] vals = collect(evaluator, measureExprs.get(i), g.getValue());
                outRow.put(measureKeys.get(i), aggregate(agg(measures.get(i)), vals, g.getValue().size()));
            }
            out.add(outRow);
        }

        int limit = req.getLimit() == null ? MAX_LIMIT : Math.min(req.getLimit(), MAX_LIMIT);
        if (out.size() > limit) out = out.subList(0, limit);

        return new DatasetResponseDto("query", columns, out);
    }

    /* ---------------- helpers ---------------- */

    private boolean passesFilters(Map<String, Object> row, List<Filter> filters) {
        if (filters == null) return true;
        for (Filter f : filters) {
            if (!StringUtils.hasText(f.getColKey()) || !StringUtils.hasText(f.getOp())) continue;
            Object cell = row.get(f.getColKey());
            if (!compare(cell, f.getOp(), f.getValue())) return false;
        }
        return true;
    }

    private boolean compare(Object cell, String op, Object value) {
        double a = ExpressionEvaluator.toNum(ExpressionEvaluator.coerce(cell));
        double b = ExpressionEvaluator.toNum(value);
        boolean numeric = !Double.isNaN(a) && !Double.isNaN(b);
        String cs = ExpressionEvaluator.str(ExpressionEvaluator.coerce(cell));
        String vs = value == null ? "" : String.valueOf(value);
        switch (op) {
            case "=": case "==": return numeric ? a == b : cs.equals(vs);
            case "!=": case "<>": return numeric ? a != b : !cs.equals(vs);
            case "<": return numeric ? a < b : cs.compareTo(vs) < 0;
            case "<=": return numeric ? a <= b : cs.compareTo(vs) <= 0;
            case ">": return numeric ? a > b : cs.compareTo(vs) > 0;
            case ">=": return numeric ? a >= b : cs.compareTo(vs) >= 0;
            case "contains": return cs.toLowerCase().contains(vs.toLowerCase());
            default: return true;
        }
    }

    private double[] collect(ExpressionEvaluator evaluator, Node expr, List<Map<String, Object>> rows) {
        List<Double> vals = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            double v = ExpressionEvaluator.toNum(evaluator.eval(expr, r));
            if (!Double.isNaN(v)) vals.add(v);
        }
        double[] arr = new double[vals.size()];
        for (int i = 0; i < arr.length; i++) arr[i] = vals.get(i);
        return arr;
    }

    private Object aggregate(String agg, double[] vals, int groupSize) {
        switch (agg) {
            case "count": return (double) groupSize;          // row count, incl. blanks
            case "countv": return (double) vals.length;       // non-null value count
            case "sum": return finite(sum(vals));
            case "min": return vals.length == 0 ? null : finite(Arrays.stream(vals).min().getAsDouble());
            case "max": return vals.length == 0 ? null : finite(Arrays.stream(vals).max().getAsDouble());
            case "median": case "p50": return pct(vals, 50);
            case "p25": return pct(vals, 25);
            case "p75": return pct(vals, 75);
            case "avg": default: return vals.length == 0 ? null : finite(sum(vals) / vals.length);
        }
    }

    private static double sum(double[] v) { double s = 0; for (double x : v) s += x; return s; }

    private static Object pct(double[] vals, double p) {
        if (vals.length == 0) return null;
        double[] sorted = vals.clone();
        Arrays.sort(sorted);
        double pct = Math.max(0, Math.min(100, p)) / 100.0;
        double rank = pct * (sorted.length - 1);
        int lo = (int) Math.floor(rank), hi = (int) Math.ceil(rank);
        return lo == hi ? sorted[lo] : sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo]);
    }

    private static Object finite(double d) { return Double.isFinite(d) ? d : null; }

    private static String agg(Measure m) {
        return StringUtils.hasText(m.getAgg()) ? m.getAgg().toLowerCase() : "avg";
    }

    private String labelFor(DatasetResponseDto base, String key) {
        for (DatasetColumnDto c : base.getColumns()) if (c.getKey().equals(key)) return c.getLabel();
        return key;
    }

    private String typeFor(DatasetResponseDto base, String key) {
        for (DatasetColumnDto c : base.getColumns()) if (c.getKey().equals(key)) return c.getType();
        return "string";
    }

    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
}
