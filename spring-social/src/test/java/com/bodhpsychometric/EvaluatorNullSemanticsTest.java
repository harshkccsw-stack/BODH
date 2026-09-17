package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.service.datastudio.expression.ExpressionEvaluator;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService;

/**
 * What a comparison answers when it has nothing to compare.
 *
 * <p>The failure this pins: a missing operand used to become the empty
 * string, and {@code "" <= "33"} is true, so a band rule whose score never
 * arrived labelled every respondent with its lowest band and no rule failed.
 * An unfinished attempt — whose score columns are null by design — was
 * "Developing Drive" on every dry run.
 */
class EvaluatorNullSemanticsTest {

    private static Object eval(String expression, Map<String, Object> row) {
        ExpressionService service = new ExpressionService();
        List<Map<String, Object>> population = new ArrayList<>();
        population.add(row);
        return new ExpressionEvaluator(population).eval(service.parse(expression), row);
    }

    private static Map<String, Object> row(Object score) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("mqt:1", score);
        row.put("rule:flag", "INVALID");
        return row;
    }

    @Test
    void aMissingScoreComparesToNothingRatherThanToTheEmptyString() {
        assertNull(eval("[mqt:1] <= 33", row(null)), "null against a number has no answer");
        assertNull(eval("[mqt:1] >= 33", row(null)));
        assertNull(eval("[mqt:1] = 33", row(null)));
        // And so an IF takes its else branch — the unfinished attempt is not
        // banded "Low" any more.
        assertEquals("", eval("IF([mqt:1] <= 33, 'Low', '')", row(null)));
        assertEquals("High", eval("IF([mqt:1] <= 33, 'Low', 'High')", row(null)),
                "the else branch, never the lowest band");
    }

    @Test
    void numbersStillCompareAsNumbersAndTermsAsText() {
        assertEquals(true, eval("[mqt:1] <= 33", row(33d)), "33 is on the boundary and inside");
        assertEquals(false, eval("[mqt:1] <= 33", row(34d)));
        assertEquals(true, eval("[rule:flag] = 'INVALID'", row(12d)), "a term is tested as text");
        assertEquals(false, eval("[rule:flag] = 'OK'", row(12d)));
        assertEquals(true, eval("'' = ''", row(12d)), "text against text stays lexical");
    }

    @Test
    void aNumberAgainstTextHasNoAnswer() {
        // A TERM rule fed into a numeric comparison used to compare
        // lexically ("INVALID" > "33" because 'I' > '3'). Nothing sensible
        // comes of that, so nothing is what comes of it.
        assertNull(eval("[rule:flag] >= 33", row(12d)));
        assertNull(eval("[mqt:1] = 'twelve'", row(12d)));
    }

    @Test
    void aCohortWithNoSpreadHasNoZScore() {
        // One respondent: sd is 0. This used to answer 0, "exactly average",
        // which for a cohort of one is not a measurement of anything.
        assertNull(eval("ZSCORE([mqt:1])", row(12d)));
    }
}
