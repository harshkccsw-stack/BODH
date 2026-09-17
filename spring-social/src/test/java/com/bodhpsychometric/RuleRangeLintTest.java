package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.service.datastudio.expression.ExpressionService;
import com.bodhpsychometric.service.report.RuleRangeLint;

/**
 * Thresholds no respondent can reach.
 *
 * <p>The case that motivated it: a band cut of 48 was written for a composite
 * scored 12–60 and landed on a single factor scored 4–20. Every check the
 * product had said yes — it parses, the column exists, it saves, it runs — and
 * nobody was ever banded "High Drive".
 */
class RuleRangeLintTest {

    /** Four 1–5 items feed Adaptive Execution, so 20 is the ceiling. */
    private static final Map<String, Double> MAXIMA =
            Map.of("mq:4", 20d, "mqt:1", 20d, "mq:9", 60d);

    private static final Map<String, String> LABELS =
            Map.of("mq:4", "Adaptive Execution (MQ total)");

    private static List<String> check(String expression) {
        return RuleRangeLint.check(new ExpressionService().parse(expression), MAXIMA, LABELS);
    }

    /** The reported formula, exactly as the model proposed it. */
    @Test
    void flagsAFloorAboveTheCeiling() {
        List<String> warnings = check("IF([mq:4] >= 48, 'High Drive', '')");
        assertEquals(1, warnings.size(), () -> String.valueOf(warnings));
        assertTrue(warnings.get(0).contains("Adaptive Execution"), warnings::toString);
        assertTrue(warnings.get(0).contains("20"), warnings::toString);
        assertTrue(warnings.get(0).contains("48"), warnings::toString);
    }

    /** The same claim written the other way round must read the same. */
    @Test
    void flagsTheThresholdOnEitherSide() {
        assertEquals(1, check("IF(48 <= [mq:4], 'High Drive', '')").size());
        assertEquals(1, check("IF(48 < [mq:4], 'High Drive', '')").size());
    }

    /**
     * The boundary, which is where an off-by-one lint would earn its
     * reputation. A score CAN equal its maximum.
     */
    @Test
    void leavesAReachableThresholdAlone() {
        assertEquals(List.of(), check("IF([mq:4] >= 20, 'Top', '')"));
        assertEquals(List.of(), check("IF([mq:4] = 20, 'Exactly top', '')"));
        assertEquals(List.of(), check("IF([mq:4] > 19, 'Near top', '')"));
    }

    /** {@code > max} is unsatisfiable where {@code >= max} is not. */
    @Test
    void flagsStrictlyGreaterThanTheCeiling() {
        assertEquals(1, check("IF([mq:4] > 20, 'Impossible', '')").size());
    }

    /**
     * The direction it deliberately will not guess.
     *
     * <p>{@code <= 2} is just as dead on a 4–20 factor, and the probe reports
     * no minimum, so claiming it would mean inventing one. A lint that fires on
     * correct rules gets switched off.
     */
    @Test
    void staysSilentOnTheDirectionItCannotProve() {
        assertEquals(List.of(), check("IF([mq:4] <= 2, 'Floor', '')"));
        assertEquals(List.of(), check("IF([mq:4] < 1, 'Floor', '')"));
    }

    /** A column with no known ceiling is not guessed at either. */
    @Test
    void ignoresColumnsItHasNoMaximumFor() {
        assertEquals(List.of(), check("IF([ans:Q_9] >= 999, 'x', '')"));
        assertEquals(List.of(), check("IF([rule:some-composite] >= 999, 'x', '')"));
    }

    /** The same cut on a column that CAN reach it says nothing. */
    @Test
    void distinguishesTheCompositeFromTheFactor() {
        assertEquals(List.of(), check("IF([mq:9] >= 48, 'High Drive', '')"));
        assertEquals(1, check("IF([mq:4] >= 48, 'High Drive', '')").size());
    }

    /** Band cuts are where this mistake usually lives. */
    @Test
    void flagsAnUnreachableNormBandCut() {
        List<String> warnings = check(
                "NORMBAND([mq:4], 34, 'Developing', 48, 'Moderate', 'High')");
        assertEquals(1, warnings.size(), () -> String.valueOf(warnings));
        // 34 is the first cut above 20, so everything from there up is dead.
        assertTrue(warnings.get(0).contains("34"), warnings::toString);
        assertTrue(warnings.get(0).contains("Moderate"), warnings::toString);
        assertTrue(warnings.get(0).contains("High"), warnings::toString);
    }

    /** A band whose cuts all sit inside the range is silent. */
    @Test
    void leavesAReachableNormBandAlone() {
        assertEquals(List.of(),
                check("NORMBAND([mq:4], 10, 'Developing', 15, 'Moderate', 'High')"));
    }

    /** One cut above the ceiling is one mistake, not one per band above it. */
    @Test
    void reportsAnUnreachableBandOnce() {
        assertEquals(1, check(
                "NORMBAND([mq:4], 30, 'a', 40, 'b', 50, 'c', 'd')").size());
    }

    /** Nested inside AND/OR, where a band's real conditions live. */
    @Test
    void looksInsideCompoundConditions() {
        assertEquals(1, check("IF([mq:4] >= 48 AND [mqt:1] >= 10, 'x', '')").size());
        assertEquals(2, check("IF([mq:4] >= 48 OR [mqt:1] >= 99, 'x', '')").size());
    }

    /** Negative literals parse as Neg(NumLit) and must still read as numbers. */
    @Test
    void understandsNegativeThresholds() {
        assertEquals(List.of(), check("IF([mq:4] >= -5, 'Everyone', '')"));
    }

    /** No maxima known at all — say nothing rather than everything. */
    @Test
    void saysNothingWithoutMaxima() {
        assertEquals(List.of(), RuleRangeLint.check(
                new ExpressionService().parse("IF([mq:4] >= 48, 'x', '')"), Map.of(), Map.of()));
    }
}
