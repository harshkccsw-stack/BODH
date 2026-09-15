package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.service.report.ScoringSheetParser;
import com.bodhpsychometric.service.report.ScoringSheetParser.ParsedRule;
import com.bodhpsychometric.service.report.ScoringSheetParser.ParsedSheet;

/**
 * The scoring-logic sheet reader, checked against the REAL workbook.
 *
 * <p>{@code report/scoring-logic.csv} is a copy of the Academic Drive sheet as
 * the psychometrician actually wrote it, not a fixture written to suit the
 * parser. That distinction is the point of this class: a sheet invented here
 * would quietly agree with whatever the parser happens to do, and the two
 * things most likely to break an import — quoted logic containing commas, and
 * headings that carry the step — are both things only a real sheet has.
 */
class ScoringSheetParserTest {

    private final ScoringSheetParser parser = new ScoringSheetParser();

    private static String realSheet() throws IOException {
        try (InputStream in = ScoringSheetParserTest.class
                .getResourceAsStream("/report/scoring-logic.csv")) {
            if (in == null) {
                throw new IllegalStateException("report/scoring-logic.csv is missing");
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static Map<String, ParsedRule> byCode(ParsedSheet sheet) {
        return sheet.rules().stream()
                .collect(Collectors.toMap(ParsedRule::code, Function.identity()));
    }

    /* ===================== the real workbook ===================== */

    @Test
    void readsEveryRuleInTheRealWorkbook() throws IOException {
        ParsedSheet sheet = parser.parse(realSheet());

        assertTrue(sheet.blocking().isEmpty(), () -> "blocking: " + sheet.blocking());
        assertTrue(sheet.isImportable());
        // 2 + 5 + 1 + 4 + 4 + 3 + 3:
        // 0.1–0.2, 1.1–1.5, 2.1, 3.1–3.4, 4.1–4.4, 5.1–5.3, E1–E3.
        assertEquals(22, sheet.rules().size(), () -> "got " + byCode(sheet).keySet());
    }

    @Test
    void filesEachRuleUnderTheStepItsHeadingNames() throws IOException {
        Map<String, ParsedRule> rules = byCode(parser.parse(realSheet()));

        assertEquals("VALIDITY", rules.get("0.2").stage(), "step 0 is data capture");
        assertEquals("VALIDITY", rules.get("1.1").stage());
        assertEquals("SCORE", rules.get("2.1").stage(), "reverse scoring");
        assertEquals("SCORE", rules.get("3.4").stage());
        assertEquals("BAND", rules.get("4.1").stage());
        assertEquals("PROFILE", rules.get("5.1").stage());
        assertEquals("EDGE", rules.get("E1").stage(), "headed 'EDGE CASES', not 'STEP n'");
    }

    /**
     * The rows that a naive comma-split destroys.
     *
     * <p>Every rule worth importing is quoted precisely because its logic
     * contains commas, so this is the failure mode that would ruin the import
     * while looking like it worked.
     */
    @Test
    void keepsQuotedLogicWhole() throws IOException {
        Map<String, ParsedRule> rules = byCode(parser.parse(realSheet()));

        assertEquals("IF AD_composite >= 48 THEN band = 'High Drive'. "
                        + "Routing: stretch opportunities, autonomy, leadership roles.",
                rules.get("4.1").logicText());

        assertTrue(rules.get("2.1").logicText().contains("(I3, I6, I11)"),
                () -> "commas inside the quoted cell: " + rules.get("2.1").logicText());
    }

    @Test
    void namesARuleFromItsCodeAndLabel() throws IOException {
        Map<String, ParsedRule> rules = byCode(parser.parse(realSheet()));

        assertEquals("1.1 Infrequency (hard fail)", rules.get("1.1").name());
        assertEquals("5.1 Believes, doesn't act", rules.get("5.1").name(),
                "the quoted label keeps its own comma");
    }

    /** Order within a step is the sheet's order — which is the priority order. */
    @Test
    void numbersRulesInSheetOrderWithinEachStep() throws IOException {
        Map<String, ParsedRule> rules = byCode(parser.parse(realSheet()));

        assertEquals(1, rules.get("4.1").stepOrder());
        assertEquals(4, rules.get("4.4").stepOrder());
        assertEquals(1, rules.get("5.1").stepOrder(), "numbering restarts per step");
        assertEquals(3, rules.get("5.3").stepOrder());
    }

    /* ===================== the grouping hint ===================== */

    @Test
    void findsWhatEachRuleAssignsTo() throws IOException {
        Map<String, ParsedRule> rules = byCode(parser.parse(realSheet()));

        assertEquals("band", rules.get("4.1").writesTo());
        assertEquals("profile_note", rules.get("5.1").writesTo());
        assertEquals("ID_score", rules.get("3.1").writesTo(), "a bare formula, no THEN");
        assertEquals("protocol_status", rules.get("1.1").writesTo());
    }

    /**
     * The case that makes a first-match-wins reading wrong.
     *
     * <p>{@code IF V1 = 5 AND V2 = 5 THEN sd_flag = 'STRONG'} contains three
     * '=' characters and only the last is an assignment. Reading left to right
     * would report V1, and the wizard would then group this rule with anything
     * else that mentions V1 — offering a priority question about rules that do
     * not compete at all.
     */
    @Test
    void readsTheAssignmentNotTheComparison() throws IOException {
        Map<String, ParsedRule> rules = byCode(parser.parse(realSheet()));
        assertEquals("sd_flag", rules.get("1.4").writesTo());
    }

    @Test
    void reportsNoTargetWhenTheRuleAssignsNothing() {
        // 4.4 is prose: "report highlights that factor as a development priority".
        assertNull(ScoringSheetParser.writesTo(
                "Independently of band: IF any factor score <= 9 THEN report highlights that factor."));
        assertNull(ScoringSheetParser.writesTo("All 15 items must be answered."));
    }

    /** Comparison operators are not assignments, whichever way round they read. */
    @Test
    void ignoresComparisonOperators() {
        assertEquals("x", ScoringSheetParser.writesTo("IF a >= 1 AND b <= 2 THEN x = 3"));
        assertNull(ScoringSheetParser.writesTo("IF a == b THEN report it"));
    }

    /* ===================== CSV mechanics ===================== */

    @Test
    void readsEscapedQuotesInsideAQuotedField() {
        List<List<String>> rows = ScoringSheetParser.readCsv("a,\"say \"\"hi\"\" now\",c");
        assertEquals("say \"hi\" now", rows.get(0).get(1));
    }

    @Test
    void readsANewlineInsideAQuotedField() {
        List<List<String>> rows = ScoringSheetParser.readCsv("a,\"line one\nline two\",c\nd,e,f");
        assertEquals(2, rows.size(), "the embedded newline must not split the row");
        assertEquals("line one\nline two", rows.get(0).get(1));
    }

    @Test
    void survivesWindowsLineEndings() {
        List<List<String>> rows = ScoringSheetParser.readCsv("STEP 4 — BANDS,,\r\n4.1,High,x\r\n");
        assertEquals(2, rows.size());
        assertEquals("x", rows.get(1).get(2), "no stray carriage return");
    }

    @Test
    void keepsTheLastRowWhenTheFileHasNoTrailingNewline() {
        List<List<String>> rows = ScoringSheetParser.readCsv("a,b,c\nd,e,f");
        assertEquals(2, rows.size());
        assertEquals("f", rows.get(1).get(2));
    }

    /* ===================== refusals and warnings ===================== */

    @Test
    void refusesAnEmptyFile() {
        ParsedSheet sheet = parser.parse("");
        assertFalse(sheet.isImportable());
        assertTrue(sheet.blocking().get(0).contains("empty"));
    }

    @Test
    void refusesAFileWithNoRuleRows() {
        ParsedSheet sheet = parser.parse("STEP 1 — VALIDITY CHECKS,,\n\nSTEP 4 — BANDS,,\n");
        assertFalse(sheet.isImportable());
        assertTrue(sheet.blocking().get(0).contains("No rules found"),
                () -> String.valueOf(sheet.blocking()));
    }

    /**
     * Rule names are unique across the whole installation, so a sheet holding
     * the same name twice cannot import. Refusing up front beats discovering it
     * on row 12 of a part-written import.
     */
    @Test
    void refusesASheetThatRepeatsARuleName() {
        // The SAME code as well as the same label — because the code is part of
        // the name, "4.1 High Drive" and "4.2 High Drive" are two distinct
        // rules and importing both is perfectly fine.
        ParsedSheet sheet = parser.parse(
                "STEP 4 — BANDS,,\n4.1,High Drive,x\n4.1,High Drive,y\n");
        assertFalse(sheet.isImportable());
        assertTrue(sheet.blocking().stream().anyMatch(b -> b.contains("repeats a name")),
                () -> String.valueOf(sheet.blocking()));
    }

    @Test
    void warnsAboutARowWithNoLogicInsteadOfImportingIt() {
        ParsedSheet sheet = parser.parse("STEP 4 — BANDS,,\n4.1,High Drive,\n4.2,Low Drive,y\n");
        assertEquals(1, sheet.rules().size());
        assertTrue(sheet.warnings().get(0).contains("no logic"),
                () -> String.valueOf(sheet.warnings()));
    }

    /**
     * An unrecognised heading files its rules under Score rather than dropping
     * them. Being in the wrong step is visible and one click to fix; being
     * absent is neither.
     */
    @Test
    void keepsRulesUnderAnUnrecognisedHeading() {
        ParsedSheet sheet = parser.parse("SECTION ALPHA,,\nA1,Something,x\n");
        assertEquals(1, sheet.rules().size());
        assertEquals("SCORE", sheet.rules().get(0).stage());
        assertTrue(sheet.warnings().get(0).contains("could not tell which step"),
                () -> String.valueOf(sheet.warnings()));
    }

    @Test
    void keepsRulesThatAppearBeforeAnyHeading() {
        ParsedSheet sheet = parser.parse("4.1,High Drive,x\n");
        assertEquals(1, sheet.rules().size());
        assertTrue(sheet.warnings().get(0).contains("before any STEP heading"),
                () -> String.valueOf(sheet.warnings()));
    }

    @Test
    void treatsARowWithOnlyALabelAsAHeading() {
        ParsedSheet sheet = parser.parse("STEP 5 — PROFILE,,,,,,\n5.1,Name,logic\n");
        assertEquals(1, sheet.rules().size());
        assertEquals("PROFILE", sheet.rules().get(0).stage());
    }
}
