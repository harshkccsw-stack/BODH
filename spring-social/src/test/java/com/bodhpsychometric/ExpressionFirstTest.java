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
 * {@code FIRST(a, b, …)} — priority selection among rules that all fired.
 *
 * <p>The workbook's step 5 is the case that needs it. A respondent scoring
 * ID 16 / ST 9 / AE 9 satisfies BOTH "believes, doesn't act"
 * ({@code ID >= 15 AND AE <= 11}) and "starts, doesn't finish"
 * ({@code ID >= 15 AND ST <= 11}), while the template has one profile
 * placeholder. Nothing in the sheet says which sentence wins, so the
 * expression has to: argument order is the priority order.
 */
class ExpressionFirstTest {

    /** Step 5.1 — high belief, low execution. */
    private static final String BELIEVES_NOT_ACTS =
            "IF([rule:internal-drive] >= 15 AND [rule:adaptive-execution] <= 11, "
                    + "'High belief, low execution.', '')";

    /** Step 5.3 — high belief, weak follow-through. */
    private static final String STARTS_NOT_FINISHES =
            "IF([rule:internal-drive] >= 15 AND [rule:sustained-tenacity] <= 11, "
                    + "'Strong start, weak follow-through.', '')";

    private static Object evaluate(String expression, Map<String, Object> row) {
        ExpressionService service = new ExpressionService();
        ExpressionService.Node root = service.parse(expression);
        List<Map<String, Object>> population = new ArrayList<>();
        population.add(row);
        return new ExpressionEvaluator(population).eval(root, row);
    }

    private static Map<String, Object> scores(double drive, double tenacity, double execution) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rule:internal-drive", drive);
        row.put("rule:sustained-tenacity", tenacity);
        row.put("rule:adaptive-execution", execution);
        return row;
    }

    private static String profile(String first, String second, Map<String, Object> row) {
        return String.valueOf(evaluate(
                "FIRST(" + first + ", " + second + ", 'No distinctive profile')", row));
    }

    @Test
    void picksTheEarlierCandidateWhenBothRulesFire() {
        // ID 16 / ST 9 / AE 9 — 5.1 and 5.3 are both true.
        Map<String, Object> row = scores(16, 9, 9);
        assertEquals("High belief, low execution.",
                evaluate(BELIEVES_NOT_ACTS, row), "5.1 fires");
        assertEquals("Strong start, weak follow-through.",
                evaluate(STARTS_NOT_FINISHES, row), "5.3 fires too");

        assertEquals("High belief, low execution.",
                profile(BELIEVES_NOT_ACTS, STARTS_NOT_FINISHES, row));
    }

    /**
     * The same respondent, the arguments swapped. If order did not decide the
     * winner, one of these two assertions would have to fail.
     */
    @Test
    void argumentOrderIsThePriorityOrder() {
        Map<String, Object> row = scores(16, 9, 9);
        assertEquals("Strong start, weak follow-through.",
                profile(STARTS_NOT_FINISHES, BELIEVES_NOT_ACTS, row));
    }

    @Test
    void skipsRulesThatDidNotFire() {
        // ID 16 / ST 9 / AE 18 — only 5.3 matches.
        assertEquals("Strong start, weak follow-through.",
                profile(BELIEVES_NOT_ACTS, STARTS_NOT_FINISHES, scores(16, 9, 18)));
    }

    @Test
    void fallsThroughToTheLastArgumentWhenNothingFires() {
        // Strong on everything — neither profile rule applies.
        assertEquals("No distinctive profile",
                profile(BELIEVES_NOT_ACTS, STARTS_NOT_FINISHES, scores(18, 18, 18)));
    }

    /**
     * Zero is an answer, not a blank.
     *
     * <p>This is the one place FIRST could quietly corrupt a report: if it
     * reused the evaluator's {@code truthy()} — where 0 is false — then every
     * respondent who genuinely scored zero would print the fallback instead of
     * their score, and the report would look populated while being wrong.
     */
    @Test
    void treatsZeroAndFalseAsPresent() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rule:score", 0d);
        assertEquals(0d, evaluate("FIRST([rule:score], 99)", row));
        assertEquals(false, evaluate("FIRST(1 > 2, 1 < 2)", row));
    }

    /** Whitespace-only text is as absent as ''. */
    @Test
    void treatsMissingAndBlankTextAsAbsent() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rule:blank", "   ");
        assertEquals("fallback", evaluate("FIRST([rule:blank], 'fallback')", row));
        assertEquals("fallback", evaluate("FIRST([rule:never-set], 'fallback')", row));
    }

    /** Every candidate empty and no fallback given — null, not an exception. */
    @Test
    void returnsNullWhenEveryCandidateIsAbsent() {
        Map<String, Object> row = new LinkedHashMap<>();
        assertNull(evaluate("FIRST([rule:a], [rule:b])", row));
    }

    /**
     * A later candidate is never evaluated once an earlier one answers.
     *
     * <p>Proven with a tail that would THROW: {@code IF(1)} is well-formed to
     * the parser — arity is checked during analysis, which {@link #evaluate}
     * deliberately skips — so evaluating it reaches for a second argument that
     * is not there. Eager evaluation fails this test with
     * IndexOutOfBoundsException; lazy evaluation never looks.
     *
     * <p>A tail of {@code SQRT(0 - 1)} would NOT prove this: NaN comes back as
     * null, so eager and lazy would agree on the answer and the test would
     * pass against either implementation.
     */
    @Test
    void doesNotEvaluateCandidatesAfterTheWinner() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rule:winner", "picked");
        assertEquals("picked", evaluate("FIRST([rule:winner], IF(1))", row));
    }

    @Test
    void reportsAsTextWhenAnyCandidateIsText() {
        DsExprResponse r = new ExpressionService().validate(
                "FIRST([rule:a], 'No distinctive profile')", Set.of("rule:a"));
        assertTrue(r.ok(), () -> String.valueOf(r.errors()));
        assertEquals("string", r.resultType());
    }

    /** FIRST reads only the current row, so it must not arm the cohort guard. */
    @Test
    void isRowLocalNotPopulation() {
        DsExprResponse r = new ExpressionService().validate(
                "FIRST([rule:a], [rule:b])", Set.of("rule:a", "rule:b"));
        assertTrue(r.ok(), () -> String.valueOf(r.errors()));
        assertEquals(ExpressionService.CLIENT, r.evalTarget());
    }

    @Test
    void refusesASingleArgumentCall() {
        DsExprResponse r = new ExpressionService().validate("FIRST([rule:a])", Set.of("rule:a"));
        assertFalse(r.ok());
        assertTrue(r.errors().stream().anyMatch(e -> e.contains("FIRST()")),
                () -> "expected an arity complaint, got " + r.errors());
    }

    /** 'BY col' scoping belongs to cohort functions; FIRST is not one. */
    @Test
    void refusesAByScope() {
        DsExprResponse r = new ExpressionService().validate(
                "FIRST([rule:a] BY gender, 'x')", Set.of("rule:a", "gender"));
        assertFalse(r.ok());
    }
}
