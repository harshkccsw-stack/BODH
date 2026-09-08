package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.service.datastudio.expression.ExpressionEvaluator;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService;

/**
 * The Academic Drive workbook's step 4, checked at its boundaries.
 *
 * <p>The workbook states the bands as <b>&le; 33 / 34–47 / &ge; 48</b>.
 * {@code NORMBAND} tests strictly-less-than, so those bands are written with
 * cuts at <b>34 and 48</b> — the number the band STARTS at, not the one it
 * ends at. Writing 33 and 47 parses, runs, and puts everybody sitting exactly
 * on a boundary one band too low, in every report, with nothing to notice.
 *
 * <p>Boundaries are the only values worth asserting here. A test at 20 and 60
 * would pass against both the right formula and the wrong one.
 */
class AcademicDriveBandsTest {

    private static final String BANDS =
            "NORMBAND([rule:composite-academic-drive], "
                    + "34, 'Developing Drive', 48, 'Moderate Drive', 'High Drive')";

    /** The low-factor callout: a factor in the bottom third of the 4–20 range. */
    private static final String CALLOUT =
            "IF([rule:internal-drive] <= 9, 'Internal Drive is a development priority.', '')";

    private static Object evaluate(String expression, Map<String, Object> row) {
        ExpressionService service = new ExpressionService();
        ExpressionService.Node root = service.parse(expression);
        List<Map<String, Object>> population = new ArrayList<>();
        population.add(row);
        return new ExpressionEvaluator(population).eval(root, row);
    }

    private static Object band(double composite) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rule:composite-academic-drive", composite);
        return evaluate(BANDS, row);
    }

    private static Object callout(double factor) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rule:internal-drive", factor);
        return evaluate(CALLOUT, row);
    }

    @Test
    void theBandCutsLandOnTheWorkbooksBoundaries() {
        // ≤ 33 Developing — 33 is the last value in it, 34 is not.
        assertEquals("Developing Drive", band(33), "33 is the top of Developing");
        assertEquals("Moderate Drive", band(34), "34 STARTS Moderate — the off-by-one that "
                + "writing the cut as 33 would get wrong");

        // 34–47 Moderate — 47 is the last value in it, 48 is not.
        assertEquals("Moderate Drive", band(47), "47 is the top of Moderate");
        assertEquals("High Drive", band(48), "48 STARTS High — the second off-by-one");

        // Well inside each band, so a formula that only got the edges right by
        // accident still has to agree about the middle.
        assertEquals("Developing Drive", band(12));
        assertEquals("Moderate Drive", band(40));
        assertEquals("High Drive", band(60));
    }

    @Test
    void theLowFactorCalloutFiresOnTheBottomThirdOfFourToTwenty() {
        // "<= 9" is literal in IF — unlike NORMBAND, there is no exclusive cut
        // to compensate for, so the workbook's 9 is written as 9.
        assertEquals("Internal Drive is a development priority.", callout(9),
                "9 is inside the bottom third and must fire");
        assertEquals("", callout(10), "10 is out of the bottom third and must stay silent");
        assertEquals("Internal Drive is a development priority.", callout(4),
                "4 is the floor of the scale");
    }

    /**
     * A callout that stays silent yields the empty string, which is what makes
     * the binding print its fallback text instead of the word "null".
     */
    @Test
    void aSilentCalloutIsEmptyRatherThanNull() {
        assertEquals("", callout(20));
    }

    // ── suppressed scores ────────────────────────────────────────────────

    private static Object evaluateWith(String expression, Map<String, Object> row) {
        return evaluate(expression, row);
    }

    /**
     * <b>A suppressed score satisfies {@code <=} and this is the trap.</b>
     *
     * <p>An invalid protocol suppresses each score to the empty string. The
     * comparison then has a non-numeric side, so {@code compare()} falls back to
     * comparing the two as STRINGS — and {@code "".compareTo("9")} is negative,
     * so {@code '' <= 9} is <b>true</b>. A naive bottom-third callout therefore
     * fires for exactly the respondents whose scores were thrown away.
     *
     * <p>{@code >=} is safe by the same accident (an empty string sorts below
     * everything), which is why the step 5 profile rules — all of which require
     * at least one {@code >=} — stay silent on their own. The callout has no
     * {@code >=} and needs one.
     */
    @Test
    void aSuppressedScoreWronglySatisfiesALessThanTest() {
        Map<String, Object> suppressed = new LinkedHashMap<>();
        suppressed.put("rule:internal-drive", "");

        assertEquals("Internal Drive is a development priority.",
                evaluateWith(CALLOUT, suppressed),
                "the naive callout fires on a protocol that was never scored — "
                        + "this is the behaviour the range guard exists to stop");
    }

    /** The fix: bound the test at the scale floor, so a blank cannot qualify. */
    @Test
    void aRangeGuardedCalloutStaysSilentOnASuppressedScore() {
        String guarded = "IF([rule:internal-drive] >= 4 AND [rule:internal-drive] <= 9, "
                + "'Internal Drive is a development priority.', '')";

        Map<String, Object> suppressed = new LinkedHashMap<>();
        suppressed.put("rule:internal-drive", "");
        assertEquals("", evaluateWith(guarded, suppressed),
                "a score that was never computed is not a low score");

        Map<String, Object> low = new LinkedHashMap<>();
        low.put("rule:internal-drive", 9.0);
        assertEquals("Internal Drive is a development priority.", evaluateWith(guarded, low),
                "and a genuinely low score still fires");

        Map<String, Object> floor = new LinkedHashMap<>();
        floor.put("rule:internal-drive", 4.0);
        assertEquals("Internal Drive is a development priority.", evaluateWith(guarded, floor),
                "including one at the very bottom of the 4-20 scale");
    }

    /**
     * The step 5 profile rules are silent on a suppressed protocol without a
     * guard, because each one requires a {@code >=} that an empty string fails.
     * Asserted so that stays true if anybody rewrites them.
     */
    @Test
    void profileNotesStaySilentOnASuppressedProtocol() {
        String believesDoesntAct =
                "IF([rule:internal-drive] >= 15 AND [rule:adaptive-execution] <= 11, "
                        + "'High belief, low execution - needs accountability structures "
                        + "and concrete action plans.', '')";

        Map<String, Object> suppressed = new LinkedHashMap<>();
        suppressed.put("rule:internal-drive", "");
        suppressed.put("rule:adaptive-execution", "");
        assertEquals("", evaluateWith(believesDoesntAct, suppressed));

        Map<String, Object> matches = new LinkedHashMap<>();
        matches.put("rule:internal-drive", 16.0);
        matches.put("rule:adaptive-execution", 10.0);
        assertEquals("High belief, low execution - needs accountability structures "
                + "and concrete action plans.", evaluateWith(believesDoesntAct, matches));

        // 15 and 11 are both INSIDE their conditions — the workbook's >= and <=
        // are literal in IF, unlike NORMBAND's exclusive cuts.
        Map<String, Object> edge = new LinkedHashMap<>();
        edge.put("rule:internal-drive", 15.0);
        edge.put("rule:adaptive-execution", 11.0);
        assertEquals("High belief, low execution - needs accountability structures "
                + "and concrete action plans.", evaluateWith(believesDoesntAct, edge));
    }

    /**
     * 5.1 and 5.3 can both be true at once, which is why they are three rules
     * and not one NORMBAND-style chain.
     */
    @Test
    void twoProfileNotesCanFireForTheSameRespondent() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rule:internal-drive", 16.0);
        row.put("rule:adaptive-execution", 10.0);
        row.put("rule:sustained-tenacity", 10.0);

        String believesDoesntAct =
                "IF([rule:internal-drive] >= 15 AND [rule:adaptive-execution] <= 11, 'A', '')";
        String startsDoesntFinish =
                "IF([rule:internal-drive] >= 15 AND [rule:sustained-tenacity] <= 11, 'C', '')";

        assertEquals("A", evaluateWith(believesDoesntAct, row));
        assertEquals("C", evaluateWith(startsDoesntFinish, row),
                "both notes apply to one person, so neither may exclude the other");
    }
}
