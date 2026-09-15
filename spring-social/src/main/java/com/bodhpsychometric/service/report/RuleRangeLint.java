package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.bodhpsychometric.service.datastudio.expression.ExpressionService.And;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.Bin;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.Call;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.Cmp;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.ColRef;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.Neg;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.Node;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.Not;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.NumLit;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.Or;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.StrLit;

/**
 * Thresholds a score can never reach.
 *
 * <h2>The failure this exists for</h2>
 *
 * <p>A band cut compared against the wrong column is valid in every way the
 * checker previously understood: it parses, every name resolves, it saves, it
 * runs, and it produces a report for every respondent. It is simply never true.
 * {@code IF([mq:4] >= 48, 'High Drive', '')} against a trait that four 1–5
 * items feed tops out at 20 — so nobody is ever "High Drive", and the only
 * evidence is an empty band in a distribution nobody thought to look at.
 *
 * <p>The real case: a composite scored 12–60 was meant, the formula named a
 * single factor scored 4–20, and the cut travelled across unchanged. Nothing
 * about the expression was wrong; the wrong quantity was in it. That class of
 * mistake is invisible to a validator and obvious to arithmetic, which is the
 * whole argument for checking it here.
 *
 * <h2>What it will and will not claim</h2>
 *
 * <p>Only the direction it can PROVE. {@link ReportShapeProbe} reports the
 * largest score a trait can reach — a property of the instrument, not of who
 * has answered — so a floor written above that maximum is provably dead. The
 * opposite direction ({@code <= 2} where the minimum is 4) is just as dead and
 * is deliberately NOT reported: the probe does not compute a minimum, and a
 * lint that guesses one would fire on correct rules. A lint people learn to
 * ignore is worse than no lint.
 *
 * <p>Only raw score columns, too. A cut against {@code [rule:composite]} needs
 * that rule's own reachable maximum, which means walking the DAG and summing —
 * worth doing, not done here. The gap is narrow in practice because this
 * catches the mistake at the moment it is made: reaching for a column when a
 * rule was meant is precisely how the wrong quantity gets in.
 *
 * <p>Pure and static, like {@link RuleReferenceLint}: it is handed a parsed
 * tree and a table of maxima and answers out of those two things alone.
 */
public final class RuleRangeLint {

    private RuleRangeLint() {
    }

    /**
     * @param root    the parsed formula
     * @param maxima  column key → the largest value it can reach, from
     *                {@link ReportShapeProbe}. Keys absent from this map are
     *                not checked at all.
     * @param labels  column key → its human name, for the message. Optional;
     *                the key is used when a label is missing.
     * @return one warning per unreachable threshold, in the order met
     */
    public static List<String> check(Node root, Map<String, Double> maxima,
            Map<String, String> labels) {
        List<String> out = new ArrayList<>();
        if (root == null || maxima == null || maxima.isEmpty()) {
            return out;
        }
        walk(root, maxima, labels == null ? Map.of() : labels, out);
        return List.copyOf(out);
    }

    private static void walk(Node n, Map<String, Double> maxima, Map<String, String> labels,
            List<String> out) {
        if (n instanceof Cmp) {
            Cmp c = (Cmp) n;
            comparison(c, maxima, labels, out);
            walk(c.l, maxima, labels, out);
            walk(c.r, maxima, labels, out);
        } else if (n instanceof Call) {
            Call c = (Call) n;
            if ("NORMBAND".equals(c.name)) {
                normBand(c, maxima, labels, out);
            }
            for (Node arg : c.args) {
                walk(arg, maxima, labels, out);
            }
        } else if (n instanceof Bin) {
            walk(((Bin) n).l, maxima, labels, out);
            walk(((Bin) n).r, maxima, labels, out);
        } else if (n instanceof And) {
            walk(((And) n).l, maxima, labels, out);
            walk(((And) n).r, maxima, labels, out);
        } else if (n instanceof Or) {
            walk(((Or) n).l, maxima, labels, out);
            walk(((Or) n).r, maxima, labels, out);
        } else if (n instanceof Not) {
            walk(((Not) n).e, maxima, labels, out);
        } else if (n instanceof Neg) {
            walk(((Neg) n).e, maxima, labels, out);
        }
    }

    /**
     * One comparison of a score against a constant.
     *
     * <p>Both operand orders are handled because both get written:
     * {@code [mq:4] >= 48} and {@code 48 <= [mq:4]} are the same claim, and a
     * lint that only understood one of them would look arbitrary.
     */
    private static void comparison(Cmp c, Map<String, Double> maxima, Map<String, String> labels,
            List<String> out) {
        String key = keyOf(c.l);
        Double threshold = constantOf(c.r);
        String op = c.op;
        if (key == null || threshold == null) {
            key = keyOf(c.r);
            threshold = constantOf(c.l);
            op = mirror(c.op);
        }
        if (key == null || threshold == null || op == null) {
            return;
        }
        Double max = maxima.get(key);
        if (max == null) {
            return;
        }
        // Only a floor above the ceiling is provable without a minimum.
        boolean dead = switch (op) {
            case ">=" -> threshold > max;
            case ">" -> threshold >= max;
            case "=", "==" -> threshold > max;
            default -> false;
        };
        if (dead) {
            out.add(name(key, labels) + " can reach at most " + num(max)
                    + ", so \"" + op + " " + num(threshold) + "\" is never true — "
                    + "no respondent can ever match this. "
                    + "Check whether a composite was meant rather than this column.");
        }
    }

    /**
     * {@code NORMBAND(value, cut1, label1, …, finalLabel)}.
     *
     * <p>Cuts are tested in order and are exclusive at the bottom, so a cut
     * above the value's ceiling is never crossed: that branch answers for
     * everybody, and every band ABOVE it — the final label included — is
     * unreachable. Reporting the first such cut is enough; the ones after it
     * are the same mistake counted twice.
     */
    private static void normBand(Call c, Map<String, Double> maxima, Map<String, String> labels,
            List<String> out) {
        if (c.args.isEmpty()) {
            return;
        }
        String key = keyOf(c.args.get(0));
        if (key == null) {
            return;
        }
        Double max = maxima.get(key);
        if (max == null) {
            return;
        }
        for (int i = 1; i + 1 < c.args.size(); i += 2) {
            Double cut = constantOf(c.args.get(i));
            if (cut == null || cut <= max) {
                continue;
            }
            List<String> dead = new ArrayList<>();
            for (int j = i + 2; j + 1 < c.args.size(); j += 2) {
                String label = textOf(c.args.get(j + 1));
                if (label != null) {
                    dead.add("\"" + label + "\"");
                }
            }
            String last = textOf(c.args.get(c.args.size() - 1));
            if (last != null) {
                dead.add("\"" + last + "\"");
            }
            out.add(name(key, labels) + " can reach at most " + num(max)
                    + ", so the band starting at " + num(cut) + " is never entered"
                    + (dead.isEmpty() ? "" : " and " + String.join(", ", dead)
                            + (dead.size() == 1 ? " is" : " are") + " never produced")
                    + ". Check whether a composite was meant rather than this column.");
            return;
        }
    }

    /* ---------------- reading leaves ---------------- */

    private static String keyOf(Node n) {
        return n instanceof ColRef ? ((ColRef) n).key : null;
    }

    /** A literal number, negation included — {@code -1} parses as Neg(NumLit). */
    private static Double constantOf(Node n) {
        if (n instanceof NumLit) {
            return ((NumLit) n).v;
        }
        if (n instanceof Neg) {
            Double inner = constantOf(((Neg) n).e);
            return inner == null ? null : -inner;
        }
        return null;
    }

    private static String textOf(Node n) {
        return n instanceof StrLit ? ((StrLit) n).v : null;
    }

    private static String mirror(String op) {
        return switch (op) {
            case "<" -> ">";
            case "<=" -> ">=";
            case ">" -> "<";
            case ">=" -> "<=";
            case "=", "==", "!=", "<>" -> op;
            default -> null;
        };
    }

    private static String name(String key, Map<String, String> labels) {
        String label = labels.get(key);
        return label == null || label.isBlank() ? key : label + " [" + key + "]";
    }

    /** 20 rather than 20.0; band cuts are written as whole numbers. */
    private static String num(double d) {
        return d == Math.floor(d) && !Double.isInfinite(d)
                ? String.valueOf((long) d) : String.valueOf(d);
    }

    /** {@link ReportShapeProbe} shapes reduced to the maxima this needs. */
    public static Map<String, Double> maximaOf(Map<String, ReportShapeProbe.MqtShape> shapes) {
        Map<String, Double> out = new LinkedHashMap<>();
        shapes.forEach((key, shape) -> out.put(key, shape.maxPossible()));
        return out;
    }
}
