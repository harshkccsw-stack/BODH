package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;

/**
 * Reads the workbook's Items_Master tab.
 *
 * <p><b>Column-keyed, unlike {@link ScoringSheetParser}, and the difference is
 * the sheet's not a preference.</b> The logic tab has section headings that
 * carry meaning, blank separator rows and rules that mention one another, so it
 * has to be read positionally. The item tab is a flat table under a fixed
 * header row — the same shape the question bulk upload treats as a column
 * mapping — so it is read by column NAME. That matters because practitioners
 * reorder columns: a positional read of this tab would silently swap Factor and
 * Construct the first time somebody moved one.
 *
 * <p><b>A missing required column is refused by NAME, before anything else is
 * checked.</b> Same trade the respondent sheet makes: one message saying
 * "there is no Statement column" beats fifteen saying "row 4 has no statement".
 */
@Service
public class ItemMasterParser {

    /** One item as the sheet states it, before anything is resolved. */
    public record ParsedItem(
            int sheetRow,
            String itemCode,
            Integer adminPosition,
            String factor,
            String construct,
            String statement,
            boolean reverseScored,
            boolean inComposite) {
    }

    public record ParsedItemSheet(
            List<ParsedItem> items,
            List<String> warnings,
            List<String> blocking) {

        public boolean isImportable() {
            return blocking.isEmpty() && !items.isEmpty();
        }
    }

    /* The header names we look for, already normalised. */
    private static final String COL_ITEM_ID = "itemid";
    private static final String COL_POSITION = "adminposition";
    private static final String COL_FACTOR = "factor";
    private static final String COL_CONSTRUCT = "construct";
    private static final String COL_STATEMENT = "statement";
    private static final String COL_REVERSE = "reversescored";
    private static final String COL_IN_COMPOSITE = "incomposite";

    public ParsedItemSheet parse(String csv) {
        List<String> warnings = new ArrayList<>();
        List<String> blocking = new ArrayList<>();

        if (csv == null || csv.isBlank()) {
            blocking.add("The item sheet is empty.");
            return new ParsedItemSheet(List.of(), warnings, blocking);
        }

        List<List<String>> rows = ScoringSheetParser.readCsv(csv);
        int headerRow = findHeaderRow(rows);
        if (headerRow < 0) {
            blocking.add("This sheet has no Item_ID column, so it is not the item list. "
                    + "Expected a header row with Item_ID and Statement.");
            return new ParsedItemSheet(List.of(), warnings, blocking);
        }

        Map<String, Integer> columns = headerColumns(rows.get(headerRow));
        if (!columns.containsKey(COL_STATEMENT)) {
            blocking.add("This sheet has no Statement column. The statement is how an item is "
                    + "matched to a question, so it cannot be imported without one.");
            return new ParsedItemSheet(List.of(), warnings, blocking);
        }
        // One warning naming both, not one each: they fail together and for the
        // same reason, and two sentences saying the same thing is how a warning
        // list becomes something people scroll past.
        List<String> missingTraitColumns = new ArrayList<>();
        if (!columns.containsKey(COL_FACTOR)) {
            missingTraitColumns.add("Factor");
        }
        if (!columns.containsKey(COL_CONSTRUCT)) {
            missingTraitColumns.add("Construct");
        }
        if (!missingTraitColumns.isEmpty()) {
            warnings.add("This sheet has no " + String.join(" or ", missingTraitColumns)
                    + " column, so no item can be tied to a measured quality. Rules naming a "
                    + "factor score will not resolve.");
        }

        List<ParsedItem> items = new ArrayList<>();
        Map<String, Integer> seenCodes = new LinkedHashMap<>();

        for (int i = headerRow + 1; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            int sheetRow = i + 1;

            if (isBlank(row)) {
                // The table ends at its first blank row, and what follows is
                // not part of it. The real workbook proves why this has to be
                // a hard stop: after the fifteen items comes a blank row, then
                // "NOTES FOR TECH TEAM" and four paragraphs of prose — each of
                // which has text in column A and nothing in Statement, so a
                // parser that merely skipped them would report four items with
                // no statement and refuse the whole sheet.
                //
                // A blank row BEFORE the first item is just spacing under the
                // header, so it only ends the table once items have started.
                if (!items.isEmpty()) {
                    int ignored = countRemaining(rows, i);
                    if (ignored > 0) {
                        warnings.add("Stopped at the blank row on line " + sheetRow + "; the "
                                + ignored + " row(s) after it were not read as items.");
                    }
                    break;
                }
                continue;
            }

            String code = at(row, columns, COL_ITEM_ID);
            String statement = at(row, columns, COL_STATEMENT);

            if (code.isEmpty() && statement.isEmpty()) {
                continue;
            }
            if (code.isEmpty()) {
                warnings.add("Row " + sheetRow + ": no item code, so it was skipped.");
                continue;
            }
            if (statement.isEmpty()) {
                blocking.add("Row " + sheetRow + ": item \"" + code + "\" has no statement, "
                        + "so it cannot be matched to a question.");
                continue;
            }
            Integer firstSeen = seenCodes.putIfAbsent(code.toLowerCase(Locale.ROOT), sheetRow);
            if (firstSeen != null) {
                // Item codes are the join, and a repeated one means every rule
                // mentioning it is ambiguous. Refusing beats picking a row.
                blocking.add("Row " + sheetRow + ": item code \"" + code
                        + "\" was already used on row " + firstSeen + ".");
                continue;
            }

            items.add(new ParsedItem(
                    sheetRow,
                    code,
                    number(at(row, columns, COL_POSITION)),
                    emptyToNull(at(row, columns, COL_FACTOR)),
                    emptyToNull(at(row, columns, COL_CONSTRUCT)),
                    statement,
                    flag(at(row, columns, COL_REVERSE), false, code, COL_REVERSE, warnings),
                    flag(at(row, columns, COL_IN_COMPOSITE), true, code, COL_IN_COMPOSITE,
                            warnings)));
        }

        if (items.isEmpty() && blocking.isEmpty()) {
            blocking.add("No items found under the header row.");
        }
        return new ParsedItemSheet(items, warnings, blocking);
    }

    /* ===================== the header ===================== */

    /**
     * The header is wherever Item_ID is, not necessarily row 1 — workbooks
     * routinely carry a title row above the table.
     */
    private static int findHeaderRow(List<List<String>> rows) {
        for (int i = 0; i < rows.size() && i < 10; i++) {
            for (String cell : rows.get(i)) {
                if (COL_ITEM_ID.equals(normalise(cell))) {
                    return i;
                }
            }
        }
        return -1;
    }

    private static Map<String, Integer> headerColumns(List<String> header) {
        Map<String, Integer> columns = new LinkedHashMap<>();
        for (int i = 0; i < header.size(); i++) {
            String key = normalise(header.get(i));
            if (!key.isEmpty()) {
                // First wins: a sheet with two "Notes" columns should not have
                // the later one shadow the earlier.
                columns.putIfAbsent(key, i);
            }
        }
        return columns;
    }

    /** Non-blank rows after the table ended, so the warning can say how many. */
    private static int countRemaining(List<List<String>> rows, int from) {
        int count = 0;
        for (int i = from; i < rows.size(); i++) {
            if (!isBlank(rows.get(i))) {
                count++;
            }
        }
        return count;
    }

    /* ===================== cells ===================== */

    /** Lowercased with every separator removed: "Reverse_Scored" → "reversescored". */
    static String normalise(String header) {
        return header == null ? "" : header.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static String at(List<String> row, Map<String, Integer> columns, String column) {
        Integer index = columns.get(column);
        if (index == null || index >= row.size()) {
            return "";
        }
        String value = row.get(index);
        return value == null ? "" : value.trim();
    }

    /**
     * Y/N, generously.
     *
     * <p>An unrecognised value takes the default and WARNS rather than failing:
     * the flags decide whether an item is reversed and whether it counts toward
     * a composite, both of which §7's lints check against the question bank
     * anyway. A typo here surfaces there, with the bank's own answer beside it.
     */
    private static boolean flag(String raw, boolean fallback, String code, String column,
            List<String> warnings) {
        String value = raw.trim().toLowerCase(Locale.ROOT);
        if (value.isEmpty()) {
            return fallback;
        }
        if (value.startsWith("y") || value.equals("true") || value.equals("1")) {
            return true;
        }
        if (value.startsWith("n") || value.equals("false") || value.equals("0")) {
            return false;
        }
        warnings.add("Item " + code + ": could not read \"" + raw + "\" as a yes/no in "
                + column + ", so it was treated as " + (fallback ? "yes" : "no") + ".");
        return fallback;
    }

    /** Spreadsheets write whole numbers as "1.0" often enough to expect it. */
    private static Integer number(String raw) {
        if (raw.isEmpty()) {
            return null;
        }
        try {
            return (int) Math.round(Double.parseDouble(raw));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String emptyToNull(String value) {
        return value.isEmpty() ? null : value;
    }

    private static boolean isBlank(List<String> row) {
        for (String cell : row) {
            if (cell != null && !cell.isBlank()) {
                return false;
            }
        }
        return true;
    }
}
