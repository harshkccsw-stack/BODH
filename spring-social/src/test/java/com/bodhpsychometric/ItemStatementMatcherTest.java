package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.model.report.ReportItemBinding;
import com.bodhpsychometric.service.report.ItemStatementMatcher;
import com.bodhpsychometric.service.report.ItemStatementMatcher.Candidate;
import com.bodhpsychometric.service.report.ItemStatementMatcher.Match;

/**
 * Matching item statements to question stems.
 *
 * <p>Pure, so every rule that decides what an item code MEANS is tested without
 * a database standing in the way. These are the rules that decide whether
 * {@code I1} points at the right question, and a wrong answer here is a wrong
 * report that looks perfectly normal.
 */
class ItemStatementMatcherTest {

    private static Candidate q(long id, int order, String stem) {
        return new Candidate(id, 100 + id, "Q_" + order, order, stem);
    }

    private static Map<String, String> items(String... codeThenStatement) {
        Map<String, String> out = new LinkedHashMap<>();
        for (int i = 0; i < codeThenStatement.length; i += 2) {
            out.put(codeThenStatement[i], codeThenStatement[i + 1]);
        }
        return out;
    }

    /* ===================== the tiers ===================== */

    @Test
    void matchesIdenticalWordingExactly() {
        Map<String, Match> matched = ItemStatementMatcher.matchAll(
                items("I1", "I am sure I can learn what it needs."),
                List.of(q(7, 1, "I am sure I can learn what it needs.")),
                Map.of());

        assertEquals(ReportItemBinding.MATCH_EXACT, matched.get("I1").method());
        assertEquals(7L, matched.get("I1").candidate().questionId());
    }

    /**
     * The differences that are always drift and never meaning: a curly
     * apostrophe, a trailing period, a double space, a capital.
     */
    @Test
    void matchesThroughPunctuationAndSpacingDrift() {
        Map<String, Match> matched = ItemStatementMatcher.matchAll(
                items("I1", "I am sure I can learn what it needs."),
                List.of(q(7, 1, "I am  sure I can learn what it needs")),
                Map.of());

        assertEquals(ReportItemBinding.MATCH_NORMALISED, matched.get("I1").method());
    }

    /**
     * Stems are stored as rich text and statements are typed into a cell.
     * Without tag stripping every match would fall to fuzzy the moment a stem
     * carried a {@code <p>}.
     */
    @Test
    void matchesAnHtmlStemAgainstAPlainStatement() {
        Map<String, Match> matched = ItemStatementMatcher.matchAll(
                items("I1", "I am sure I can learn what it needs."),
                List.of(q(7, 1, "<p>I am sure I can learn what it needs.</p>")),
                Map.of());

        assertEquals(ReportItemBinding.MATCH_EXACT, matched.get("I1").method());
    }

    @Test
    void suggestsACloseButNotIdenticalStatementAndSaysSo() {
        Map<String, Match> matched = ItemStatementMatcher.matchAll(
                items("I1", "When a long project turns out harder than I expected, "
                        + "I stay with it till it is done."),
                List.of(q(7, 1, "When a long project turns out harder than expected, "
                        + "I stay with it until it is done.")),
                Map.of());

        assertEquals(ReportItemBinding.MATCH_FUZZY, matched.get("I1").method());
        assertTrue(matched.get("I1").note().contains("Check this one"),
                () -> matched.get("I1").note());
    }

    @Test
    void refusesToMatchTwoUnrelatedStatements() {
        Map<String, Match> matched = ItemStatementMatcher.matchAll(
                items("I1", "I am sure I can learn what it needs."),
                List.of(q(7, 1, "I have attended at least one class in the past year.")),
                Map.of());

        assertNull(matched.get("I1").candidate());
        assertEquals(ReportItemBinding.MATCH_NONE, matched.get("I1").method());
    }

    /* ===================== claiming ===================== */

    /**
     * The reason matching is tiered and greedy rather than item-by-item.
     *
     * <p>Matched one at a time in sheet order, I1 would meet Q9 first — a fuzzy
     * match good enough to pass the floor — and claim it, leaving I2 to take
     * I1's own question or fail. Taking every EXACT match first means each item
     * ends up on the question that is actually its own.
     */
    @Test
    void anExactMatchClaimsItsQuestionBeforeAnyFuzzyOneCan() {
        Map<String, Match> matched = ItemStatementMatcher.matchAll(
                items("I1", "I am sure I can learn what it needs",
                      "I2", "I am sure I can learn what it needs today"),
                List.of(q(9, 1, "I am sure I can learn what it needs today"),
                        q(7, 2, "I am sure I can learn what it needs")),
                Map.of());

        assertEquals(7L, matched.get("I1").candidate().questionId());
        assertEquals(9L, matched.get("I2").candidate().questionId());
        assertEquals(ReportItemBinding.MATCH_EXACT, matched.get("I1").method());
        assertEquals(ReportItemBinding.MATCH_EXACT, matched.get("I2").method());
    }

    @Test
    void neverBindsTwoItemsToTheSameQuestion() {
        Map<String, Match> matched = ItemStatementMatcher.matchAll(
                items("I1", "I am sure I can learn what it needs",
                      "I2", "I am sure I can learn what it needs"),
                List.of(q(7, 1, "I am sure I can learn what it needs")),
                Map.of());

        long bound = matched.values().stream().filter(Match::isResolved).count();
        assertEquals(1, bound, () -> String.valueOf(matched));
    }

    /**
     * Two questions carrying the same stem resolve NEITHER. Picking the first
     * is exactly how a binding becomes quietly wrong, and the reviewer has a
     * picker for precisely this.
     */
    @Test
    void refusesToChooseBetweenTwoIdenticalStems() {
        Map<String, Match> matched = ItemStatementMatcher.matchAll(
                items("I1", "I am sure I can learn what it needs"),
                List.of(q(7, 1, "I am sure I can learn what it needs"),
                        q(8, 2, "I am sure I can learn what it needs")),
                Map.of());

        assertNull(matched.get("I1").candidate());
        assertTrue(matched.get("I1").note().contains("by hand"), matched.get("I1").note());
    }

    /* ===================== the human ===================== */

    @Test
    void aManualChoiceBeatsAnExactMatchElsewhere() {
        Map<String, Match> matched = ItemStatementMatcher.matchAll(
                items("I1", "I am sure I can learn what it needs"),
                List.of(q(7, 1, "I am sure I can learn what it needs"),
                        q(8, 2, "Something else entirely")),
                Map.of("I1", 8L));

        assertEquals(8L, matched.get("I1").candidate().questionId());
        assertEquals(ReportItemBinding.MATCH_MANUAL, matched.get("I1").method());
    }

    @Test
    void aManualChoiceOfAQuestionThatIsNotPlacedIsRefusedRatherThanIgnored() {
        Map<String, Match> matched = ItemStatementMatcher.matchAll(
                items("I1", "I am sure I can learn what it needs"),
                List.of(q(7, 1, "I am sure I can learn what it needs")),
                Map.of("I1", 999L));

        assertNull(matched.get("I1").candidate());
        assertTrue(matched.get("I1").note().contains("not placed"), matched.get("I1").note());
    }

    @Test
    void everyItemComesBackWithAnAnswerEvenWhenNothingMatches() {
        Map<String, Match> matched = ItemStatementMatcher.matchAll(
                items("I1", "one", "I2", "two", "I3", "three"), List.of(), Map.of());

        assertEquals(3, matched.size());
        matched.forEach((code, match) -> assertNotNull(match.note(), code));
    }
}
