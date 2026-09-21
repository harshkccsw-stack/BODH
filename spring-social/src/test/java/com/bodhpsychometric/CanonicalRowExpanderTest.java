package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.bodhpsychometric.service.question.sheet.CanonicalRowExpander;
import com.bodhpsychometric.service.question.sheet.CanonicalRowExpander.ExpandedRow;
import com.bodhpsychometric.service.question.sheet.CanonicalRowExpander.Expansion;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.ColumnMap;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.OptionMode;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.OptionSpec;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.ReverseSpec;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.RowRange;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.ScalePoint;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.ScoringMode;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.ScoringSpec;
import com.bodhpsychometric.service.report.ScoringSheetParser;

/**
 * The expander, against the practitioner's REAL workbook.
 *
 * <p>The input is {@code report/items-master.csv} — the same fixture the item
 * binding tests use, which is byte-identical to what the browser produces from
 * {@code docs/Report Logic.xlsx}. So this is not a test against a convenient
 * shape someone invented: it is the actual sheet, notes block and all.
 *
 * <p>No model is involved anywhere here. The spec is hand-written, which is the
 * point of the design — once the shape is known the transformation is
 * mechanical, and this is where that claim is checked.
 */
class CanonicalRowExpanderTest {

    private static final String QUALITY = "Internal Drive › Self-Efficacy";
    private static final String GROWTH = "Internal Drive › Growth Mindset";

    private List<List<String>> realSheet() throws IOException {
        String csv = new String(new ClassPathResource("report/items-master.csv")
                .getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        return ScoringSheetParser.readCsv(csv);
    }

    /** The five-point agree scale the sheet states in prose at the bottom. */
    private static List<ScalePoint> agreeScale() {
        return List.of(
                new ScalePoint("Strongly Disagree", 1d),
                new ScalePoint("Disagree", 2d),
                new ScalePoint("Neutral", 3d),
                new ScalePoint("Agree", 4d),
                new ScalePoint("Strongly Agree", 5d));
    }

    /** What the model is expected to produce for this workbook. */
    private static SheetMappingSpec referenceSpec() {
        return new SheetMappingSpec(
                "Items_Master", 1, new RowRange(2, 16), List.of(),
                new ColumnMap("Statement", null, "Item_ID", "Admin_Position",
                        List.of("Factor", "Construct"), "Reverse_Scored", "In_Composite", null, null),
                new OptionSpec(OptionMode.SHARED_SCALE, "row 20 of the sheet",
                        agreeScale(), null, null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT,
                        new ReverseSpec("Reverse_Scored", List.of("Y"), List.of("N"))),
                null, List.of(), List.of(), true, List.of(), null);
    }

    /* ===================== the real sheet ===================== */

    @Test
    void theRealWorkbookExpandsToFifteenQuestions() throws IOException {
        Expansion out = CanonicalRowExpander.expand(referenceSpec(), realSheet());

        assertTrue(out.ok(), "blockers: " + out.blockers());
        assertEquals(15, out.rows().size());
        // Rows 17-22 are a blank line and the NOTES FOR TECH TEAM block. They
        // are outside the declared range, so nothing has to recognise them.
        assertEquals(16, out.rows().get(14).sourceRow());
        // The sheet's own flags are consistent — Admin_Position is 1..15 and
        // every Validity item is out of the composite while every other item
        // is in — so the consistency checks must be silent on it. A false
        // positive here would be a warning on every real workbook.
        assertTrue(out.warnings().isEmpty(), "warnings: " + out.warnings());
        assertTrue(out.rows().get(3).excludedFromComposite(), "V1 is In_Composite = N");
        assertFalse(out.rows().get(0).excludedFromComposite(), "I1 is In_Composite = Y");
    }

    @Test
    void stemsAreCopiedFromTheCellVerbatim() throws IOException {
        Expansion out = CanonicalRowExpander.expand(referenceSpec(), realSheet());

        assertEquals("If I get a totally new kind of task or role, I am sure I can learn what it needs.",
                out.rows().get(0).cells().get("stem"));
        // The comma inside the quoted CSV field survives, which is the thing a
        // naive split on ',' would have eaten.
        assertTrue(out.rows().get(1).cells().get("stem").startsWith("Even in things I am weak at today,"));
    }

    @Test
    void theSharedScaleBecomesFiveLabelledOptions() throws IOException {
        ExpandedRow first = CanonicalRowExpander.expand(referenceSpec(), realSheet()).rows().get(0);

        assertEquals("Strongly Disagree", first.cells().get("option1"));
        assertEquals("Strongly Agree", first.cells().get("option5"));
        assertFalse(first.cells().containsKey("option6"));
        // MCQ, not LINEAR_SCALE: the labels survive and each option carries its
        // own score, which is the only shape reverse scoring can be expressed in.
        assertEquals(QUALITY + ":1", first.cells().get("option1Scores"));
        assertEquals(QUALITY + ":5", first.cells().get("option5Scores"));
        assertEquals("", first.cells().get("scores"));
    }

    @Test
    void reverseScoredItemsInvertTheirOptionScores() throws IOException {
        List<ExpandedRow> rows = CanonicalRowExpander.expand(referenceSpec(), realSheet()).rows();
        ExpandedRow i3 = rows.get(2); // Reverse_Scored = Y

        assertTrue(i3.reverseScored());
        assertEquals(GROWTH + ":5", i3.cells().get("option1Scores"));
        assertEquals(GROWTH + ":3", i3.cells().get("option3Scores"));
        assertEquals(GROWTH + ":1", i3.cells().get("option5Scores"));
        // The option ORDER is untouched — the respondent sees the scale the
        // practitioner wrote; only the numbers invert.
        assertEquals("Strongly Disagree", i3.cells().get("option1"));

        // I2 sits on the same construct and is NOT reversed, so the two differ
        // only in their numbers. That is the pair the whole feature turns on.
        assertEquals(GROWTH + ":1", rows.get(1).cells().get("option1Scores"));
        assertFalse(rows.get(1).reverseScored());
    }

    @Test
    void exactlyThreeItemsAreReversed() throws IOException {
        long reversed = CanonicalRowExpander.expand(referenceSpec(), realSheet()).rows().stream()
                .filter(ExpandedRow::reverseScored).count();
        // The sheet's own note names them: I3, I6, I11.
        assertEquals(3, reversed);
    }

    @Test
    void distinctQualityPathsAreCountedNotRepeated() throws IOException {
        Expansion out = CanonicalRowExpander.expand(referenceSpec(), realSheet());

        // Eight distinct paths across four factors: Adaptive Execution alone
        // carries three constructs, which is the case that makes a flat
        // "one factor, one MQT" assumption wrong.
        assertEquals(8, out.pathCounts().size());
        assertEquals(2, out.pathCounts().get(QUALITY));          // I1, I4
        assertEquals(2, out.pathCounts().get(GROWTH));           // I2, I3
        assertEquals(4, out.pathCounts().get("Sustained Tenacity › Perseverance"));
        assertEquals(2, out.pathCounts().get("Validity › Social Desirability"));
        assertEquals(1, out.pathCounts().get("Validity › Infrequency"));
        assertEquals(2, out.pathCounts().get("Adaptive Execution › Proactivity"));
        assertEquals(1, out.pathCounts().get("Adaptive Execution › Metacognition"));
        // Every item is counted exactly once, which is what says no row was
        // dropped on the way through.
        assertEquals(15, out.pathCounts().values().stream().mapToInt(Integer::intValue).sum());
    }

    /* ===================== the pivot is computed ===================== */

    @Test
    void reversePivotComesFromTheScaleAndNotAHardcodedSix() {
        // A 0-4 scale reverses at 4. A hardcoded "6 - raw" — which is what the
        // sheet's own note says, because ITS scale is 1-5 — would produce 6, 5,
        // 4, 3, 2 here: every score off the end of the scale, and all of them
        // still plausible-looking numbers.
        List<ScalePoint> zeroToFour = List.of(
                new ScalePoint("Never", 0d), new ScalePoint("Rarely", 1d),
                new ScalePoint("Sometimes", 2d), new ScalePoint("Often", 3d),
                new ScalePoint("Always", 4d));
        SheetMappingSpec spec = new SheetMappingSpec(
                "s", 1, new RowRange(2, 2), List.of(),
                new ColumnMap("Statement", null, null, null, List.of("Factor"), "Rev", null, null, null),
                new OptionSpec(OptionMode.SHARED_SCALE, null, zeroToFour, null, null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT,
                        new ReverseSpec("Rev", List.of("Y"), List.of("N"))),
                null, List.of(), List.of(), true, List.of(), null);

        Expansion out = CanonicalRowExpander.expand(spec, List.of(
                List.of("Statement", "Factor", "Rev"),
                List.of("I put things off.", "Focus", "Y")));

        assertTrue(out.ok(), "blockers: " + out.blockers());
        assertEquals("Focus:4", out.rows().get(0).cells().get("option1Scores"));
        assertEquals("Focus:0", out.rows().get(0).cells().get("option5Scores"));
    }

    /* ===================== refusals ===================== */

    @Test
    void aColumnTheSheetDoesNotHaveIsABlocker() throws IOException {
        SheetMappingSpec spec = new SheetMappingSpec(
                "Items_Master", 1, new RowRange(2, 16), List.of(),
                new ColumnMap("Question Text", null, null, null, List.of("Factor"), null, null, null, null),
                new OptionSpec(OptionMode.SHARED_SCALE, null, agreeScale(), null, null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT, null),
                null, List.of(), List.of(), true, List.of(), null);

        Expansion out = CanonicalRowExpander.expand(spec, realSheet());

        assertFalse(out.ok());
        assertTrue(out.blockers().get(0).contains("Question Text"), out.blockers().toString());
        assertTrue(out.rows().isEmpty(), "nothing is expanded from a mapping that does not fit");
    }

    @Test
    void anUnrecognisedReverseFlagStopsTheImport() {
        SheetMappingSpec spec = new SheetMappingSpec(
                "s", 1, new RowRange(2, 2), List.of(),
                new ColumnMap("Statement", null, null, null, List.of("Factor"), "Rev", null, null, null),
                new OptionSpec(OptionMode.SHARED_SCALE, null, agreeScale(), null, null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT,
                        new ReverseSpec("Rev", List.of("Y"), List.of("N"))),
                null, List.of(), List.of(), true, List.of(), null);

        Expansion out = CanonicalRowExpander.expand(spec, List.of(
                List.of("Statement", "Factor", "Rev"),
                List.of("I put things off.", "Focus", "R")));

        // Reading "R" as "not reversed" would invert nothing, say nothing, and
        // be wrong in a way no later screen could show.
        assertFalse(out.ok());
        assertTrue(out.skipped().get(0).why().contains("neither yes nor no"), out.skipped().toString());
    }

    @Test
    void twoColumnsOfTheSameNameAreRefused() {
        Expansion out = CanonicalRowExpander.expand(referenceSpec(), List.of(
                List.of("Statement", "Factor", "Construct", "Factor", "Reverse_Scored"),
                List.of("a", "b", "c", "d", "N")));

        assertFalse(out.ok());
        assertTrue(out.blockers().get(0).contains("more than one column"), out.blockers().toString());
    }

    @Test
    void aRowWithNoQuestionTextIsSkippedByName_andTheRestImport() {
        SheetMappingSpec spec = new SheetMappingSpec(
                "s", 1, new RowRange(2, 3), List.of(),
                new ColumnMap("Statement", null, null, null, List.of("Factor"), null, null, null, null),
                new OptionSpec(OptionMode.SHARED_SCALE, null, agreeScale(), null, null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT, null),
                null, List.of(), List.of(), true, List.of(), null);

        Expansion out = CanonicalRowExpander.expand(spec, List.of(
                List.of("Statement", "Factor"),
                List.of("I put things off.", "Focus"),
                List.of("", "Focus")));

        // One unusable row used to cost the whole import. It is now left out
        // by name, and the row above it still becomes a question.
        assertTrue(out.ok(), "blockers: " + out.blockers());
        assertEquals(1, out.rows().size());
        assertEquals(3, out.skipped().get(0).row());
    }

    @Test
    void aQualityNameHoldingTheScoreSeparatorIsRefused() {
        SheetMappingSpec spec = new SheetMappingSpec(
                "s", 1, new RowRange(2, 2), List.of(),
                new ColumnMap("Statement", null, null, null, List.of("Factor"), null, null, null, null),
                new OptionSpec(OptionMode.SHARED_SCALE, null, agreeScale(), null, null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT, null),
                null, List.of(), List.of(), true, List.of(), null);

        // "Focus: Deep" would produce the cell "Focus: Deep:3", which the
        // template parser splits at the LAST colon and reads as a quality
        // called "Focus: Deep" - right by luck here, wrong the moment a score
        // is not the last thing in the cell.
        Expansion out = CanonicalRowExpander.expand(spec, List.of(
                List.of("Statement", "Factor"),
                List.of("I put things off.", "Focus: Deep")));

        assertFalse(out.ok());
        assertTrue(out.skipped().get(0).why().contains("separators"), out.skipped().toString());
    }

    @Test
    void optionsInFreeTextAreRefusedRatherThanGuessedAt() {
        SheetMappingSpec spec = new SheetMappingSpec(
                "s", 1, new RowRange(2, 2), List.of(),
                new ColumnMap("Statement", null, null, null, List.of("Factor"), null, null, null, null),
                new OptionSpec(OptionMode.PER_ROW_TEXT, null, null, null, null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT, null),
                null, List.of(), List.of(), true, List.of(), null);

        Expansion out = CanonicalRowExpander.expand(spec, List.of(
                List.of("Statement", "Factor"),
                List.of("How often? a) Never b) Always", "Focus")));

        assertFalse(out.ok());
        assertTrue(out.blockers().get(0).contains("not supported yet"), out.blockers().toString());
    }

    /* ===================== the selection field ===================== */

    private static SheetMappingSpec withSelection(String rule, Integer count) {
        return new SheetMappingSpec(
                "s", 1, new RowRange(2, 2), List.of(),
                new ColumnMap("Statement", null, null, null, List.of("Factor"), null, null, null, null),
                new OptionSpec(OptionMode.SHARED_SCALE, null, agreeScale(), null, null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT, null),
                new SheetMappingSpec.SelectionSpec(rule, count), List.of(), List.of(), true, List.of(), null);
    }

    private static List<List<String>> oneRow() {
        return List.of(List.of("Statement", "Factor"), List.of("Pick some.", "Focus"));
    }

    @Test
    void anInstructionInTheSelectionFieldStopsTheImport() {
        // A real workbook produced exactly this: the model read "Present items
        // in Admin_Position order" off the notes block and put it in the field
        // that means "how many options may be picked", with a count of 15 on a
        // five-option question. Dropping an unrecognised value would also drop
        // a genuine "pick at most 2", so it stops instead.
        Expansion out = CanonicalRowExpander.expand(
                withSelection("Admin_Position order", 15), oneRow());

        assertFalse(out.ok());
        assertTrue(out.blockers().get(0).contains("min, max or equals"), out.blockers().toString());
    }

    @Test
    void aRecognisedRuleIsNormalisedToWhatTheTemplateReads() {
        Expansion out = CanonicalRowExpander.expand(withSelection("At Most", 2), oneRow());

        assertTrue(out.ok(), "blockers: " + out.blockers());
        assertEquals("max", out.rows().get(0).cells().get("selectRule"));
        assertEquals("2", out.rows().get(0).cells().get("selectCount"));
    }

    @Test
    void noSelectionAtAllIsSingleChoice() {
        Expansion out = CanonicalRowExpander.expand(withSelection(null, null), oneRow());

        assertTrue(out.ok(), "blockers: " + out.blockers());
        // Both blank is what every sheet written before these columns existed
        // means, so it has to stay the silent default.
        assertEquals("", out.rows().get(0).cells().get("selectRule"));
        assertEquals("", out.rows().get(0).cells().get("selectCount"));
    }

    @Test
    void aCountWithNoRuleIsAlwaysAMistake() {
        Expansion out = CanonicalRowExpander.expand(withSelection(null, 3), oneRow());

        assertFalse(out.ok());
        assertTrue(out.blockers().get(0).contains("no rule"), out.blockers().toString());
    }

    @Test
    void aRuleWithNoCountIsRefused() {
        Expansion out = CanonicalRowExpander.expand(withSelection("max", null), oneRow());

        assertFalse(out.ok());
        assertTrue(out.blockers().get(0).contains("how many"), out.blockers().toString());
    }

    /* ===================== unscored options ===================== */

    @Test
    void aBlankScoreInAnOptionColumnLeavesThatOptionUnscored() {
        // "No score" and "score 0" are different things to MqtScoringService.
        // The old expander wrote 0 — and then reverse scoring pivoted that 0
        // into the scale's MAXIMUM, turning an unscored option into the
        // highest-scoring one on the row.
        SheetMappingSpec spec = new SheetMappingSpec(
                "s", 1, new RowRange(2, 2), List.of(),
                new ColumnMap("Question", null, null, null, List.of("Trait"), "Rev", null, null, null),
                new OptionSpec(OptionMode.COLUMNS, null, null, List.of(
                        new SheetMappingSpec.OptionColumn("A", "A Score", null),
                        new SheetMappingSpec.OptionColumn("B", "B Score", null),
                        new SheetMappingSpec.OptionColumn("C", "C Score", null)),
                        null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT,
                        new ReverseSpec("Rev", List.of("Y"), List.of("N"))),
                null, List.of(), List.of(), true, List.of(), null);

        Expansion out = CanonicalRowExpander.expand(spec, List.of(
                List.of("Question", "Trait", "Rev", "A", "A Score", "B", "B Score", "C", "C Score"),
                List.of("Pick.", "Drive", "Y", "Often", "2", "Sometimes", "", "Never", "0")));

        assertTrue(out.ok(), "blockers: " + out.blockers());
        var cells = out.rows().get(0).cells();
        // Pivot is 0 + 2 from the VALUED points; the blank stays blank.
        assertEquals("Drive:0", cells.get("option1Scores"));
        assertEquals("", cells.get("option2Scores"));
        assertEquals("Drive:2", cells.get("option3Scores"));
    }

    @Test
    void aDeclaredScaleMissingAValueIsRefusedOnAScoredSheet() {
        List<ScalePoint> halfValued = List.of(
                new ScalePoint("Low", 1d), new ScalePoint("Mid", null), new ScalePoint("High", 3d));
        SheetMappingSpec spec = new SheetMappingSpec(
                "s", 1, new RowRange(2, 2), List.of(),
                new ColumnMap("Statement", null, null, null, List.of("Factor"), null, null, null, null),
                new OptionSpec(OptionMode.SHARED_SCALE, null, halfValued, null, null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT, null),
                null, List.of(), List.of(), true, List.of(), null);

        Expansion out = CanonicalRowExpander.expand(spec, oneRow());

        // A shared scale is used by every row: half-valuing it half-scores
        // every question in the sheet, and nothing would show which half.
        assertFalse(out.ok());
        assertTrue(out.blockers().get(0).contains("no value"), out.blockers().toString());
    }

    /* ===================== sheet-level consistency ===================== */

    private static SheetMappingSpec withOrderAndComposite() {
        return new SheetMappingSpec(
                "s", 1, new RowRange(2, 4), List.of(),
                new ColumnMap("Statement", null, null, "Pos", List.of("Factor"), null, "InComp", null, null),
                new OptionSpec(OptionMode.SHARED_SCALE, null, agreeScale(), null, null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT, null),
                null, List.of(), List.of(), true, List.of(), null);
    }

    @Test
    void aFactorWithItemsBothInAndOutOfTheCompositeIsWarnedAbout() {
        Expansion out = CanonicalRowExpander.expand(withOrderAndComposite(), List.of(
                List.of("Statement", "Pos", "Factor", "InComp"),
                List.of("a", "1", "Drive", "Y"),
                List.of("b", "2", "Drive", "N"),
                List.of("c", "3", "Validity", "N")));

        assertTrue(out.ok(), "blockers: " + out.blockers());
        // Exclusion is by quality in this platform. "Drive" half in and half
        // out is not expressible, and is usually an item under the wrong factor.
        assertEquals(1, out.warnings().size(), out.warnings().toString());
        assertTrue(out.warnings().get(0).contains("Drive"), out.warnings().toString());
        assertFalse(out.warnings().get(0).contains("Validity"), "Validity is consistently out");
    }

    @Test
    void aPresentationOrderWithAGapIsWarnedAbout() {
        Expansion out = CanonicalRowExpander.expand(withOrderAndComposite(), List.of(
                List.of("Statement", "Pos", "Factor", "InComp"),
                List.of("a", "1", "Drive", "Y"),
                List.of("b", "3", "Drive", "Y"),
                List.of("c", "3.0", "Drive", "Y")));

        assertTrue(out.ok(), "blockers: " + out.blockers());
        assertEquals(1, out.warnings().size(), out.warnings().toString());
        String w = out.warnings().get(0);
        assertTrue(w.contains("position 2"), w);
        assertTrue(w.contains("more than once"), w);
    }

    /* ===================== the other option modes ===================== */

    @Test
    void optionColumnsBecomeOptionsWithTheirOwnScores() {
        SheetMappingSpec spec = new SheetMappingSpec(
                "s", 1, new RowRange(2, 2), List.of(),
                new ColumnMap("Question", null, null, null, List.of("Trait"), null, null, null, null),
                new OptionSpec(OptionMode.COLUMNS, null, null, List.of(
                        new SheetMappingSpec.OptionColumn("Option A", "A Score", null),
                        new SheetMappingSpec.OptionColumn("Option B", "B Score", null),
                        new SheetMappingSpec.OptionColumn("Option C", "C Score", null)),
                        null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT, null),
                null, List.of(), List.of(), true, List.of(), null);

        Expansion out = CanonicalRowExpander.expand(spec, List.of(
                List.of("Question", "Trait", "Option A", "A Score", "Option B", "B Score", "Option C", "C Score"),
                // The third option is blank - a spare column, which is ordinary.
                List.of("Pick one.", "Drive", "Yes", "2", "No", "0", "", "")));

        assertTrue(out.ok(), "blockers: " + out.blockers());
        assertEquals("Yes", out.rows().get(0).cells().get("option1"));
        assertEquals("Drive:2", out.rows().get(0).cells().get("option1Scores"));
        assertEquals("Drive:0", out.rows().get(0).cells().get("option2Scores"));
        assertFalse(out.rows().get(0).cells().containsKey("option3"));
    }

    @Test
    void aPerRowScaleColumnLooksUpTheDictionary() {
        Map<String, List<ScalePoint>> scales = Map.of(
                "agree5", agreeScale(),
                "yesno", List.of(new ScalePoint("Yes", 1d), new ScalePoint("No", 0d)));
        SheetMappingSpec spec = new SheetMappingSpec(
                "s", 1, new RowRange(2, 3), List.of(),
                new ColumnMap("Question", null, null, null, List.of("Trait"), null, null, null, null),
                new OptionSpec(OptionMode.SCALE_COLUMN, null, null, null, "Scale", scales),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT, null),
                null, List.of(), List.of(), true, List.of(), null);

        Expansion out = CanonicalRowExpander.expand(spec, List.of(
                List.of("Question", "Trait", "Scale"),
                List.of("How much?", "Drive", "Agree5"),
                List.of("Did you?", "Drive", "Yes/No")));

        assertTrue(out.ok(), "blockers: " + out.blockers());
        assertEquals(5, countOptions(out.rows().get(0)));
        assertEquals(2, countOptions(out.rows().get(1)));
        assertEquals("Drive:1", out.rows().get(1).cells().get("option1Scores"));
    }

    @Test
    void aScaleNameTheMappingDoesNotDefineIsABlocker() {
        SheetMappingSpec spec = new SheetMappingSpec(
                "s", 1, new RowRange(2, 2), List.of(),
                new ColumnMap("Question", null, null, null, List.of("Trait"), null, null, null, null),
                new OptionSpec(OptionMode.SCALE_COLUMN, null, null, null, "Scale",
                        Map.of("agree5", agreeScale())),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT, null),
                null, List.of(), List.of(), true, List.of(), null);

        Expansion out = CanonicalRowExpander.expand(spec, List.of(
                List.of("Question", "Trait", "Scale"),
                List.of("How much?", "Drive", "Frequency7")));

        // The only row is unusable, so nothing imports — but the reason is
        // still the specific one, not "no questions were found".
        assertFalse(out.ok());
        assertTrue(out.skipped().get(0).why().contains("Frequency7"), out.skipped().toString());
    }

    private static int countOptions(ExpandedRow row) {
        List<String> found = new ArrayList<>();
        for (String key : row.cells().keySet()) {
            if (key.matches("option\\d+")) {
                found.add(key);
            }
        }
        return found.size();
    }

    /* ===================== score cells that name their own quality ========= */

    /**
     * A real workbook (an "Upload (MQ MQT)" tab) put "Consent:1" in the score
     * column beside each option — our own template's syntax for an option
     * score, and a flat refusal before this. The whole sheet imported as zero
     * questions, which is also why the review panel could not continue.
     */
    private static SheetMappingSpec namedScoreSpec() {
        return new SheetMappingSpec(
                "s", 1, new RowRange(2, 2), List.of(),
                new ColumnMap("Question Text", null, null, null, List.of(), null, null, null, null),
                new OptionSpec(OptionMode.COLUMNS, null, null,
                        List.of(new SheetMappingSpec.OptionColumn("Opt1", "Opt1 Score", null),
                                new SheetMappingSpec.OptionColumn("Opt2", "Opt2 Score", null)),
                        null, null),
                new ScoringSpec(ScoringMode.OPTION_VALUE_TO_ROW_MQT, null),
                null, List.of(), List.of(), true, List.of(), null);
    }

    private static List<List<String>> namedScoreGrid(String first, String second) {
        return List.of(
                List.of("Question Text", "Opt1", "Opt1 Score", "Opt2", "Opt2 Score"),
                List.of("I finish what I start", "Strongly disagree", first, "Strongly agree", second));
    }

    @Test
    void aScoreCellMayNameTheQualityItScores() {
        Expansion out = CanonicalRowExpander.expand(
                namedScoreSpec(), namedScoreGrid("Self-Efficacy:1", "Self-Efficacy:5"));

        assertTrue(out.ok(), "blockers: " + out.blockers());
        assertEquals(1, out.rows().size());
        Map<String, String> cells = out.rows().get(0).cells();
        assertEquals("Self-Efficacy:1", cells.get("option1Scores"));
        assertEquals("Self-Efficacy:5", cells.get("option2Scores"));
        // The named quality is what the review panel offers to create or map,
        // so it has to be counted even though no column named a path.
        assertEquals(Map.of("Self-Efficacy", 1), out.pathCounts());
    }

    @Test
    void severalQualitiesInOneCellAllSurvive() {
        Expansion out = CanonicalRowExpander.expand(
                namedScoreSpec(), namedScoreGrid("Focus:2 | Drive:0.5", "Focus:4"));

        assertTrue(out.ok(), "blockers: " + out.blockers());
        assertEquals("Focus:2 | Drive:0.5", out.rows().get(0).cells().get("option1Scores"));
        assertTrue(out.pathCounts().containsKey("Focus"));
        assertTrue(out.pathCounts().containsKey("Drive"));
    }

    @Test
    void aScoreCellThatNamesNothingIsStillARefusal() {
        Expansion out = CanonicalRowExpander.expand(
                namedScoreSpec(), namedScoreGrid("mostly agree", "5"));

        assertFalse(out.ok());
        assertTrue(out.skipped().get(0).why().contains("neither a number nor"), out.skipped().toString());
    }

    /* ===================== sections named on another tab ================== */

    /**
     * The real "Assessment_questionnaire_FINAL" workbook: every question row
     * carries a Section ID (55, 56, …) and the names live on a separate
     * "Section Instructions" tab. Before the dictionary, the questionnaire
     * would have ended up with sections called "55".
     */
    private static SheetMappingSpec sectionIdSpec(Map<String, SheetMappingSpec.SectionInfo> sections) {
        return new SheetMappingSpec(
                "s", 1, new RowRange(2, 3), List.of(),
                new ColumnMap("Question Text", null, null, null, List.of(), null, null, null,
                        "Section ID"),
                new OptionSpec(OptionMode.COLUMNS, null, null,
                        List.of(new SheetMappingSpec.OptionColumn("Opt1", null, null),
                                new SheetMappingSpec.OptionColumn("Opt2", null, null)),
                        null, null),
                new ScoringSpec(ScoringMode.NONE, null),
                null, List.of(), List.of(), true, List.of(), sections);
    }

    private static List<List<String>> sectionIdGrid(String firstId) {
        return List.of(
                List.of("Question Text", "Section ID", "Opt1", "Opt2"),
                List.of("Do you agree?", firstId, "Yes", "No"),
                List.of("And this one?", "56", "Yes", "No"));
    }

    @Test
    void aSectionIdBecomesTheNameTheOtherTabGivesIt() {
        Expansion out = CanonicalRowExpander.expand(
                sectionIdSpec(Map.of(
                        "55", new SheetMappingSpec.SectionInfo("Welcome & Consent", "Please read."),
                        "56", new SheetMappingSpec.SectionInfo("Evolution", null))),
                sectionIdGrid("55"));

        assertTrue(out.ok(), "blockers: " + out.blockers());
        assertEquals("Welcome & Consent", out.rows().get(0).cells().get("section"));
        assertEquals("Evolution", out.rows().get(1).cells().get("section"));
    }

    @Test
    void anIdTheSpreadsheetWroteAsANumberStillMatches() {
        Expansion out = CanonicalRowExpander.expand(
                sectionIdSpec(Map.of("55", new SheetMappingSpec.SectionInfo("Welcome & Consent", null))),
                sectionIdGrid("55.0"));

        assertEquals("Welcome & Consent", out.rows().get(0).cells().get("section"));
    }

    @Test
    void anIdWithNoEntryIsLeftAsItWasFound() {
        Expansion out = CanonicalRowExpander.expand(
                sectionIdSpec(Map.of("56", new SheetMappingSpec.SectionInfo("Evolution", null))),
                sectionIdGrid("55"));

        // Visible and wrong beats invented — the reviewer sees "55" and can say so.
        assertEquals("55", out.rows().get(0).cells().get("section"));
    }

    @Test
    void aSheetWhoseSectionColumnAlreadyHoldsNamesIsUntouched() {
        Expansion out = CanonicalRowExpander.expand(sectionIdSpec(null), sectionIdGrid("Part A"));

        assertEquals("Part A", out.rows().get(0).cells().get("section"));
    }

    /* ============ one odd row is not a broken workbook ==================== */

    /**
     * The "Assessment_questionnaire_FINAL" workbook again: five of its 98 rows
     * are section preambles sitting in the question table, each with a single
     * "I understand, continue" option. Every one of them used to be a blocker,
     * so a 93-question import produced nothing at all.
     */
    private static SheetMappingSpec plainSpec(int lastRow) {
        return new SheetMappingSpec(
                "s", 1, new RowRange(2, lastRow), List.of(),
                new ColumnMap("Question Text", null, null, null, List.of(), null, null, null, null),
                new OptionSpec(OptionMode.COLUMNS, null, null,
                        List.of(new SheetMappingSpec.OptionColumn("Opt1", null, null),
                                new SheetMappingSpec.OptionColumn("Opt2", null, null)),
                        null, null),
                new ScoringSpec(ScoringMode.NONE, null),
                null, List.of(), List.of(), true, List.of(), null);
    }

    @Test
    void aRowWithOneOptionIsSkipped_andTheRestStillImport() {
        List<List<String>> grid = List.of(
                List.of("Question Text", "Opt1", "Opt2", "Notes"),
                List.of("Do you agree?", "Yes", "No", ""),
                List.of("How you actually behave these days.", "I understand, continue", "", ""),
                List.of("And this one?", "Yes", "No", ""));

        Expansion out = CanonicalRowExpander.expand(plainSpec(4), grid);

        assertTrue(out.ok(), "blockers: " + out.blockers());
        assertEquals(2, out.rows().size());
        assertEquals(1, out.skipped().size());
        assertEquals(3, out.skipped().get(0).row());
        assertTrue(out.skipped().get(0).why().contains("one option"), out.skipped().get(0).why());
    }

    @Test
    void aSheetWhereMostRowsAreSkippedIsAMisreading() {
        List<List<String>> grid = List.of(
                List.of("Question Text", "Opt1", "Opt2"),
                List.of("Do you agree?", "Yes", "No"),
                List.of("A preamble.", "continue", ""),
                List.of("Another preamble.", "continue", ""),
                List.of("A third.", "continue", ""));

        Expansion out = CanonicalRowExpander.expand(plainSpec(5), grid);

        assertFalse(out.ok());
        assertTrue(out.blockers().get(0).contains("probably wrong rather than the sheet"),
                out.blockers().toString());
    }

    @Test
    void headersTheReadingNeverTouchedAreReported() {
        List<List<String>> grid = List.of(
                List.of("Question Text", "Opt1", "Opt2", "Question Type", "Max Options Allowed"),
                List.of("Do you agree?", "Yes", "No", "single-choice", "1"));

        Expansion out = CanonicalRowExpander.expand(plainSpec(2), grid);

        assertTrue(out.ok(), "blockers: " + out.blockers());
        // Both are real columns of the workbook that nothing reads yet — the
        // author must be told they are being dropped, not left to find out.
        assertEquals(List.of("Question Type", "Max Options Allowed"), out.unusedColumns());
    }
}
