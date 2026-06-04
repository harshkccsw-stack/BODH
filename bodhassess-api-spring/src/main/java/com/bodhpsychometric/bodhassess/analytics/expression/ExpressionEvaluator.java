package com.bodhpsychometric.bodhassess.analytics.expression;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.And;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.Bin;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.Call;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.Cmp;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.ColRef;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.Neg;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.Node;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.Not;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.NumLit;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.Or;
import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService.StrLit;

/**
 * Evaluates a parsed formula ({@link Node}) against a row, with access to the
 * full population for cohort/population functions. Row-local nodes use only the
 * current row; population functions (AVERAGE, ZSCORE, PERCENTILE, …) aggregate
 * over the population, optionally scoped by a {@code BY <column>} group.
 *
 * <p>One instance is built per derived-column computation pass over a dataset;
 * aggregate results are cached per (function-node, scope-value) so a column is
 * O(rows) not O(rows²) in practice. Referenced derived columns must already be
 * materialised into the row maps (callers compute columns in dependency order).
 */
public class ExpressionEvaluator {

    private final List<Map<String, Object>> population;
    private final Map<String, Stats> statsCache = new HashMap<>();

    public ExpressionEvaluator(List<Map<String, Object>> population) {
        this.population = population;
    }

    /** Evaluate {@code node} for {@code row}. Returns Double / String / Boolean / null. */
    public Object eval(Node node, Map<String, Object> row) {
        if (node instanceof NumLit) return ((NumLit) node).v;
        if (node instanceof StrLit) return ((StrLit) node).v;
        if (node instanceof ColRef) return coerce(row.get(((ColRef) node).key));
        if (node instanceof Neg) return safe(-toNum(eval(((Neg) node).e, row)));
        if (node instanceof Bin) return arith((Bin) node, row);
        if (node instanceof Cmp) return compare((Cmp) node, row);
        if (node instanceof And) return truthy(eval(((And) node).l, row)) && truthy(eval(((And) node).r, row));
        if (node instanceof Or) return truthy(eval(((Or) node).l, row)) || truthy(eval(((Or) node).r, row));
        if (node instanceof Not) return !truthy(eval(((Not) node).e, row));
        if (node instanceof Call) return evalCall((Call) node, row);
        return null;
    }

    private Object arith(Bin n, Map<String, Object> row) {
        double a = toNum(eval(n.l, row)), b = toNum(eval(n.r, row));
        switch (n.op) {
            case "+": return safe(a + b);
            case "-": return safe(a - b);
            case "*": return safe(a * b);
            case "/": return safe(a / b);
            default: return null;
        }
    }

    private Boolean compare(Cmp n, Map<String, Object> row) {
        Object la = eval(n.l, row), ra = eval(n.r, row);
        double a = toNum(la), b = toNum(ra);
        boolean numeric = !Double.isNaN(a) && !Double.isNaN(b);
        int c = numeric ? Double.compare(a, b) : str(la).compareTo(str(ra));
        boolean eq = numeric ? a == b : str(la).equals(str(ra));
        switch (n.op) {
            case "=": case "==": return eq;
            case "!=": case "<>": return !eq;
            case "<": return c < 0;
            case "<=": return c <= 0;
            case ">": return c > 0;
            case ">=": return c >= 0;
            default: return false;
        }
    }

    private Object evalCall(Call c, Map<String, Object> row) {
        switch (c.name) {
            // ---- row-local ----
            case "IF": return truthy(eval(c.args.get(0), row)) ? eval(c.args.get(1), row) : eval(c.args.get(2), row);
            case "AND": return c.args.stream().allMatch(a -> truthy(eval(a, row)));
            case "OR": return c.args.stream().anyMatch(a -> truthy(eval(a, row)));
            case "NOT": return !truthy(eval(c.args.get(0), row));
            case "MIN": return reduce(c, row, true);
            case "MAX": return reduce(c, row, false);
            case "ABS": return safe(Math.abs(toNum(eval(c.args.get(0), row))));
            case "SQRT": return safe(Math.sqrt(toNum(eval(c.args.get(0), row))));
            case "LOG": {
                double base = c.args.size() > 1 ? toNum(eval(c.args.get(1), row)) : 10d;
                return safe(Math.log(toNum(eval(c.args.get(0), row))) / Math.log(base));
            }
            case "ROUND": {
                int digits = c.args.size() > 1 ? (int) toNum(eval(c.args.get(1), row)) : 0;
                double f = Math.pow(10, digits);
                return safe(Math.round(toNum(eval(c.args.get(0), row)) * f) / f);
            }
            case "NORMBAND": return normBand(c, row);
            // ---- population / cohort ----
            case "COUNTIF": return (double) countIf(c, row);
            case "AVERAGEIF": return averageIf(c, row);
            case "AVERAGE": return safe(stats(c, c.args.get(0), row).mean);
            case "SUM": return safe(stats(c, c.args.get(0), row).sum);
            case "COUNT": return (double) stats(c, c.args.get(0), row).values.length;
            case "PERCENTILE": {
                double p = toNum(eval(c.args.get(1), row));
                return safe(percentile(stats(c, c.args.get(0), row).sorted, p));
            }
            case "PERCENTRANK": {
                Stats s = stats(c, c.args.get(0), row);
                double v = toNum(eval(c.args.get(0), row));
                return safe(percentRank(s.sorted, v));
            }
            case "ZSCORE": {
                Stats s = stats(c, c.args.get(0), row);
                double v = toNum(eval(c.args.get(0), row));
                if (Double.isNaN(v) || s.sd == 0) return s.sd == 0 ? 0d : null;
                return safe((v - s.mean) / s.sd);
            }
            case "RANK": {
                Stats s = stats(c, c.args.get(0), row);
                double v = toNum(eval(c.args.get(0), row));
                if (Double.isNaN(v)) return null;
                long greater = Arrays.stream(s.values).filter(x -> x > v).count();
                return (double) (greater + 1);  // 1 = highest
            }
            default: return null;
        }
    }

    private Object reduce(Call c, Map<String, Object> row, boolean min) {
        double acc = min ? Double.POSITIVE_INFINITY : Double.NEGATIVE_INFINITY;
        boolean any = false;
        for (Node a : c.args) {
            double v = toNum(eval(a, row));
            if (Double.isNaN(v)) continue;
            acc = min ? Math.min(acc, v) : Math.max(acc, v);
            any = true;
        }
        return any ? acc : null;
    }

    private Object normBand(Call c, Map<String, Object> row) {
        // NORMBAND(value, cut1, label1, cut2, label2, …, finalLabel)
        double v = toNum(eval(c.args.get(0), row));
        if (Double.isNaN(v)) return null;
        int i = 1;
        while (i + 1 < c.args.size()) {
            double cut = toNum(eval(c.args.get(i), row));
            if (v < cut) return str(eval(c.args.get(i + 1), row));
            i += 2;
        }
        return str(eval(c.args.get(c.args.size() - 1), row));  // final label
    }

    private long countIf(Call c, Map<String, Object> row) {
        Node pred = c.args.get(0);
        long n = 0;
        for (Map<String, Object> r : scoped(c, row)) if (truthy(eval(pred, r))) n++;
        return n;
    }

    private Object averageIf(Call c, Map<String, Object> row) {
        Node value = c.args.get(0), pred = c.args.get(1);
        double sum = 0; long n = 0;
        for (Map<String, Object> r : scoped(c, row)) {
            if (!truthy(eval(pred, r))) continue;
            double v = toNum(eval(value, r));
            if (Double.isNaN(v)) continue;
            sum += v; n++;
        }
        return n == 0 ? null : safe(sum / n);
    }

    /* ---------------- aggregate stats ---------------- */

    private static final class Stats {
        final double[] values;   // unsorted, NaN-filtered
        final double[] sorted;
        final double mean, sd, sum;
        Stats(double[] values) {
            this.values = values;
            this.sorted = values.clone();
            Arrays.sort(this.sorted);
            double s = 0;
            for (double v : values) s += v;
            this.sum = s;
            this.mean = values.length == 0 ? 0 : s / values.length;
            double sq = 0;
            for (double v : values) sq += (v - mean) * (v - mean);
            this.sd = values.length == 0 ? 0 : Math.sqrt(sq / values.length);  // population sd
        }
    }

    private Stats stats(Call c, Node inner, Map<String, Object> row) {
        String key = c.id + "|" + scopeValue(c, row);
        Stats cached = statsCache.get(key);
        if (cached != null) return cached;
        List<Double> vals = new ArrayList<>();
        for (Map<String, Object> r : scoped(c, row)) {
            double v = toNum(eval(inner, r));
            if (!Double.isNaN(v)) vals.add(v);
        }
        double[] arr = new double[vals.size()];
        for (int i = 0; i < arr.length; i++) arr[i] = vals.get(i);
        Stats s = new Stats(arr);
        statsCache.put(key, s);
        return s;
    }

    private List<Map<String, Object>> scoped(Call c, Map<String, Object> row) {
        if (c.scopeColumn == null) return population;
        String want = str(row.get(c.scopeColumn));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : population) if (str(r.get(c.scopeColumn)).equals(want)) out.add(r);
        return out;
    }

    private String scopeValue(Call c, Map<String, Object> row) {
        return c.scopeColumn == null ? "*" : str(row.get(c.scopeColumn));
    }

    private static double percentile(double[] sorted, double p) {
        if (sorted.length == 0) return Double.NaN;
        double pct = Math.max(0, Math.min(100, p)) / 100.0;
        double rank = pct * (sorted.length - 1);
        int lo = (int) Math.floor(rank), hi = (int) Math.ceil(rank);
        if (lo == hi) return sorted[lo];
        return sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo]);
    }

    private static double percentRank(double[] sorted, double v) {
        if (sorted.length == 0 || Double.isNaN(v)) return Double.NaN;
        long le = Arrays.stream(sorted).filter(x -> x <= v).count();
        return (double) le / sorted.length * 100.0;
    }

    /* ---------------- value coercion ---------------- */

    public static Object coerce(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Number) return ((Number) raw).doubleValue();
        if (raw instanceof Boolean) return raw;
        String s = String.valueOf(raw);
        if (s.isEmpty()) return null;
        try {
            return Double.parseDouble(s.trim());
        } catch (NumberFormatException e) {
            return s;
        }
    }

    public static double toNum(Object v) {
        if (v == null) return Double.NaN;
        if (v instanceof Number) return ((Number) v).doubleValue();
        if (v instanceof Boolean) return ((Boolean) v) ? 1 : 0;
        try {
            return Double.parseDouble(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return Double.NaN;
        }
    }

    public static boolean truthy(Object v) {
        if (v instanceof Boolean) return (Boolean) v;
        if (v instanceof Number) { double d = ((Number) v).doubleValue(); return d != 0 && !Double.isNaN(d); }
        if (v == null) return false;
        return !String.valueOf(v).isEmpty();
    }

    public static String str(Object v) {
        if (v == null) return "";
        if (v instanceof Double) {
            double d = (Double) v;
            if (d == Math.floor(d) && !Double.isInfinite(d)) return String.valueOf((long) d);
        }
        return String.valueOf(v);
    }

    static Object safe(double d) { return Double.isFinite(d) ? d : null; }
}
