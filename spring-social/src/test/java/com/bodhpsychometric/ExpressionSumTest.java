package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.dto.DsExprResponse;
import com.bodhpsychometric.service.datastudio.expression.ExpressionEvaluator;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService;

/**
 * {@code SUM(a, b, c)} adds up ONE respondent's columns.
 *
 * <p>It used to be a population aggregate — the cohort total of its FIRST
 * argument, with every later argument parsed and silently discarded. The
 * workbook's step 3.4, {@code SUM([mq:1], [mq:3], [mq:4])}, therefore printed
 * the cohort total of Internal Drive where a composite of three factors was
 * meant. For a cohort of one those are both "12", which is exactly why it
 * survived review: the wrong number was in the right range.
 */
class ExpressionSumTest {

    private static Object evaluate(String expression, List<Map<String, Object>> population) {
        ExpressionService service = new ExpressionService();
        ExpressionService.Node root = service.parse(expression);
        return new ExpressionEvaluator(population).eval(root, population.get(0));
    }

    private static Map<String, Object> factors(Double drive, Double tenacity, Double execution) {
        Map<String, Object> row = new LinkedHashMap<>();
        if (drive != null) row.put("mq:1", drive);
        if (tenacity != null) row.put("mq:3", tenacity);
        if (execution != null) row.put("mq:4", execution);
        return row;
    }

    private static final String COMPOSITE = "SUM([mq:1], [mq:3], [mq:4])";

    /** The reported case: 12 + 11 + 13, not the cohort total of [mq:1]. */
    @Test
    void addsThisRespondentsColumns() {
        List<Map<String, Object>> one = new ArrayList<>();
        one.add(factors(12d, 11d, 13d));
        assertEquals(36d, evaluate(COMPOSITE, one));
    }

    /**
     * The proof that it is not an aggregate: a second respondent must not
     * change the first one's composite.
     *
     * <p>Under the old reading both rows scored 24 — the cohort total of
     * [mq:1] — and every respondent in a batch shared one number.
     */
    @Test
    void isUnaffectedByTheRestOfTheCohort() {
        List<Map<String, Object>> two = new ArrayList<>();
        two.add(factors(12d, 11d, 13d));
        two.add(factors(12d, 20d, 20d));
        assertEquals(36d, evaluate(COMPOSITE, two));

        ExpressionService service = new ExpressionService();
        ExpressionService.Node root = service.parse(COMPOSITE);
        assertEquals(52d, new ExpressionEvaluator(two).eval(root, two.get(1)),
                "the second respondent gets their own composite");
    }

    /** SUM(a, b, c) is exactly a + b + c — the two spellings cannot disagree. */
    @Test
    void agreesWithPlainAddition() {
        List<Map<String, Object>> one = new ArrayList<>();
        one.add(factors(12d, 11d, 13d));
        assertEquals(evaluate("[mq:1] + [mq:3] + [mq:4]", one), evaluate(COMPOSITE, one));
    }

    /**
     * A missing factor yields no composite, rather than a quietly smaller one.
     *
     * <p>Excel's SUM skips blanks; this one does not, because a composite built
     * from two of its three factors is not that composite, and a report is
     * better blank than confidently wrong.
     */
    @Test
    void yieldsNothingWhenAFactorIsMissing() {
        List<Map<String, Object>> one = new ArrayList<>();
        one.add(factors(12d, null, 13d));
        assertNull(evaluate(COMPOSITE, one));
    }

    @Test
    void handlesASingleArgument() {
        List<Map<String, Object>> two = new ArrayList<>();
        two.add(factors(12d, 11d, 13d));
        two.add(factors(99d, 99d, 99d));
        assertEquals(12d, evaluate("SUM([mq:1])", two),
                "one argument is that column's value, not the column's cohort total");
    }

    /**
     * SUM must not arm the minimum-cohort guard.
     *
     * <p>This is the half of the bug that outlives the wrong number: a
     * composite flagged population suppresses itself and prints "norm group too
     * small" for every small cohort, though it never needed anyone else's row.
     */
    @Test
    void isRowLocalNotPopulation() {
        DsExprResponse r = new ExpressionService().validate(COMPOSITE,
                Set.of("mq:1", "mq:3", "mq:4"));
        assertTrue(r.ok(), () -> String.valueOf(r.errors()));
        assertEquals(ExpressionService.CLIENT, r.evalTarget());
    }

    /** 'BY col' scopes a population; SUM no longer describes one. */
    @Test
    void refusesAByScope() {
        DsExprResponse r = new ExpressionService().validate(
                "SUM([mq:1] BY gender)", Set.of("mq:1", "gender"));
        assertFalse(r.ok());
    }

    /** AVERAGE stays a cohort function — this change is about SUM alone. */
    @Test
    void leavesAverageAsACohortFunction() {
        DsExprResponse r = new ExpressionService().validate("AVERAGE([mq:1])", Set.of("mq:1"));
        assertTrue(r.ok(), () -> String.valueOf(r.errors()));
        assertEquals(ExpressionService.SERVER, r.evalTarget());

        List<Map<String, Object>> two = new ArrayList<>();
        two.add(factors(12d, 11d, 13d));
        two.add(factors(20d, 11d, 13d));
        assertEquals(16d, evaluate("AVERAGE([mq:1])", two));
        assertEquals(32d, evaluate("AVERAGE([mq:1]) * COUNT([mq:1])", two),
                "the cohort total is still reachable");
    }
}
