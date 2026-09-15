package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.service.report.ItemMasterParser;
import com.bodhpsychometric.service.report.ItemMasterParser.ParsedItem;
import com.bodhpsychometric.service.report.ItemMasterParser.ParsedItemSheet;

/**
 * The Items_Master reader, checked against the REAL tab.
 *
 * <p>{@code report/items-master.csv} is the Academic Drive workbook's item
 * sheet, converted exactly as the browser converts it. The two things a
 * fixture invented here would not have are the two things that break this
 * parser: statements full of commas, and four paragraphs of notes sitting
 * below the table with text in the Item_ID column.
 */
class ItemMasterParserTest {

    private final ItemMasterParser parser = new ItemMasterParser();

    private static String realSheet() throws IOException {
        try (InputStream in = ItemMasterParserTest.class
                .getResourceAsStream("/report/items-master.csv")) {
            if (in == null) {
                throw new IllegalStateException("report/items-master.csv is missing");
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static Map<String, ParsedItem> byCode(ParsedItemSheet sheet) {
        return sheet.items().stream()
                .collect(Collectors.toMap(ParsedItem::itemCode, Function.identity()));
    }

    /* ===================== the real sheet ===================== */

    @Test
    void readsEveryItemAndStopsBeforeTheNotes() throws IOException {
        ParsedItemSheet sheet = parser.parse(realSheet());

        assertTrue(sheet.isImportable(), () -> String.valueOf(sheet.blocking()));
        assertEquals(15, sheet.items().size(), () -> "read " + sheet.items().stream()
                .map(ParsedItem::itemCode).toList());
        // The four NOTES paragraphs each carry text in the Item_ID column and
        // nothing in Statement. Reading them as items would refuse the sheet.
        assertFalse(byCode(sheet).containsKey("NOTES FOR TECH TEAM"));
    }

    @Test
    void readsTheStatementWholeThroughItsCommas() throws IOException {
        assertEquals("If I get a totally new kind of task or role, I am sure I can learn "
                + "what it needs.", byCode(parser.parse(realSheet())).get("I1").statement());
    }

    @Test
    void readsTheReverseFlagOnlyForTheThreeReversedItems() throws IOException {
        Map<String, ParsedItem> items = byCode(parser.parse(realSheet()));
        for (String code : List.of("I3", "I6", "I11")) {
            assertTrue(items.get(code).reverseScored(), code + " should be reverse scored");
        }
        for (String code : List.of("I1", "I2", "I4", "I12", "V1")) {
            assertFalse(items.get(code).reverseScored(), code + " should not be reverse scored");
        }
    }

    @Test
    void readsTheCompositeFlagOnlyForTheThreeValidityItems() throws IOException {
        Map<String, ParsedItem> items = byCode(parser.parse(realSheet()));
        for (String code : List.of("V1", "V2", "V3")) {
            assertFalse(items.get(code).inComposite(), code + " must be out of every composite");
        }
        assertTrue(items.get("I1").inComposite());
    }

    @Test
    void readsTheFactorAndConstructAndPosition() throws IOException {
        ParsedItem i1 = byCode(parser.parse(realSheet())).get("I1");
        assertEquals("Internal Drive", i1.factor());
        assertEquals("Self-Efficacy", i1.construct());
        // The sheet writes whole numbers as "1.0"; a position of null would
        // silently drop the presentation-order lint.
        assertEquals(1, i1.adminPosition());
    }

    /* ===================== read by name, not position ===================== */

    /**
     * The one thing this parser does differently from the logic-sheet reader.
     *
     * <p>The item tab is a flat table under a header, so it is read by column
     * NAME. Practitioners reorder columns; a positional read would swap Factor
     * and Construct the first time somebody did, and nothing downstream could
     * tell — the bindings would simply point at the wrong traits.
     */
    @Test
    void readsColumnsByNameSoReorderingThemChangesNothing() {
        ParsedItemSheet reordered = parser.parse("""
                Statement,In_Composite,Item_ID,Reverse_Scored,Construct,Factor,Admin_Position
                I am sure I can learn it,Y,I1,N,Self-Efficacy,Internal Drive,1
                """);
        ParsedItem i1 = byCode(reordered).get("I1");
        assertEquals("Internal Drive", i1.factor());
        assertEquals("Self-Efficacy", i1.construct());
        assertEquals("I am sure I can learn it", i1.statement());
        assertTrue(i1.inComposite());
    }

    @Test
    void acceptsHeaderSpellingsThatDifferOnlyInSpacingAndCase() {
        ParsedItemSheet sheet = parser.parse("""
                item id,admin position,FACTOR,construct,statement,reverse scored,in composite
                I1,1,Drive,Self-Efficacy,I am sure,Y,N
                """);
        ParsedItem i1 = byCode(sheet).get("I1");
        assertTrue(i1.reverseScored());
        assertFalse(i1.inComposite());
        assertEquals("Drive", i1.factor());
    }

    @Test
    void findsTheHeaderBelowATitleRow() {
        ParsedItemSheet sheet = parser.parse("""
                ACADEMIC DRIVE - ITEM MASTER,,
                Item_ID,Statement,Factor
                I1,I am sure,Drive
                """);
        assertTrue(sheet.isImportable(), () -> String.valueOf(sheet.blocking()));
        assertEquals(1, sheet.items().size());
    }

    /* ===================== refusals ===================== */

    @Test
    void refusesASheetWithNoItemIdColumn() {
        ParsedItemSheet sheet = parser.parse("Code,Statement\nI1,I am sure\n");
        assertFalse(sheet.isImportable());
        assertTrue(sheet.blocking().get(0).contains("Item_ID"),
                () -> String.valueOf(sheet.blocking()));
    }

    /**
     * Without a statement there is no join at all — position is not one, which
     * is the whole reason this table exists. Refusing by COLUMN NAME beats one
     * "required" message per line.
     */
    @Test
    void refusesASheetWithNoStatementColumn() {
        ParsedItemSheet sheet = parser.parse("Item_ID,Factor\nI1,Drive\n");
        assertFalse(sheet.isImportable());
        assertTrue(sheet.blocking().get(0).contains("Statement"),
                () -> String.valueOf(sheet.blocking()));
    }

    /**
     * A repeated code makes every rule that mentions it ambiguous, so the sheet
     * is refused rather than one of the two rows being picked.
     */
    @Test
    void refusesARepeatedItemCode() {
        ParsedItemSheet sheet = parser.parse("""
                Item_ID,Statement
                I1,I am sure
                I1,Something else
                """);
        assertFalse(sheet.isImportable());
        assertTrue(sheet.blocking().get(0).contains("already used"),
                () -> String.valueOf(sheet.blocking()));
    }

    @Test
    void refusesAnItemWithNoStatement() {
        ParsedItemSheet sheet = parser.parse("Item_ID,Statement\nI1,\n");
        assertFalse(sheet.isImportable());
        assertTrue(sheet.blocking().get(0).contains("no statement"),
                () -> String.valueOf(sheet.blocking()));
    }

    @Test
    void warnsAboutAnUnreadableYesNoInsteadOfGuessingSilently() {
        ParsedItemSheet sheet = parser.parse("""
                Item_ID,Statement,Reverse_Scored
                I1,I am sure,maybe
                """);
        assertFalse(byCode(sheet).get("I1").reverseScored());
        assertTrue(sheet.warnings().stream().anyMatch(w -> w.contains("maybe")),
                () -> String.valueOf(sheet.warnings()));
    }

    @Test
    void warnsWhenThereIsNoFactorColumnToTieItemsToTraits() {
        ParsedItemSheet sheet = parser.parse("Item_ID,Statement\nI1,I am sure\n");
        assertTrue(sheet.isImportable(), () -> String.valueOf(sheet.blocking()));
        assertTrue(sheet.warnings().stream().anyMatch(w -> w.contains("measured quality")),
                () -> String.valueOf(sheet.warnings()));
    }
}
