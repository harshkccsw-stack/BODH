package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

/**
 * Reads a psychometrician's scoring-logic workbook into draft rules.
 *
 * <p><b>No AI.</b> This step is deterministic on purpose: the same sheet
 * always yields the same rules, and a practitioner who uploads their workbook
 * gets every rule filed under the right step without retyping one of them.
 * What they do NOT get from here is anything runnable — each rule arrives as a
 * {@code STATEMENT} carrying the sheet's own words. Turning those words into
 * expressions is a separate, optional step that can be wrong; this one cannot.
 *
 * <p><b>Why the backend parses CSV rather than the browser parsing XLSX.</b>
 * The house pattern for bulk upload (see {@code question-bulk-upload.tsx})
 * parses in the browser, and for the question sheet that is right: a flat
 * table under a fixed header row is a column mapping and little else. This
 * sheet is not that shape — it has section headings that carry the step,
 * blank separator rows, and rules that mention one another — so the logic
 * worth getting right is the part the frontend has no way to test, there
 * being no test runner in that project at all. The browser still handles
 * .xlsx: it converts the workbook to CSV with the SheetJS build it already
 * bundles and posts the text here. Neither side gains a dependency.
 *
 * <h2>The shape this expects</h2>
 * <pre>
 * STEP 4 — INTERPRETATION BANDS ...,,,,     ← section: column A only
 * 4.1,High Drive,"IF AD_composite >= 48 ...",,,   ← rule: A=code B=name C=logic
 * </pre>
 * Three columns carry everything; the rest are the spreadsheet's own padding.
 * A row with nothing in B and C is a heading, a row with nothing anywhere is a
 * separator, and everything else is a rule.
 */
@Service
public class ScoringSheetParser {

    /** Cell columns that mean something. The sheet's remaining columns are padding. */
    private static final int COL_CODE = 0;
    private static final int COL_NAME = 1;
    private static final int COL_LOGIC = 2;

    /** Mirrors RuleStage on the frontend and ReportRule's stage column. */
    static final String VALIDITY = "VALIDITY";
    static final String SCORE = "SCORE";
    static final String BAND = "BAND";
    static final String PROFILE = "PROFILE";
    static final String EDGE = "EDGE";

    /**
     * One rule as the sheet states it, before anybody decides what it means.
     *
     * @param writesTo the name the rule assigns to, when it states one — the
     *        grouping hint that drives the wizard's "one of these, or all of
     *        them?" question. A HINT and never a silent decision: it is shown
     *        for confirmation, and being wrong costs a re-grouping, not a
     *        wrong report.
     */
    public record ParsedRule(
            int sheetRow,
            String code,
            /** The rule's name as it will be created: "1.1 Infrequency (hard fail)". */
            String name,
            String logicText,
            String stage,
            int stepOrder,
            String writesTo) {
    }

    /**
     * @param blocking problems that must be fixed in the sheet before import.
     *        Warnings are advisory; these are not.
     */
    public record ParsedSheet(
            List<ParsedRule> rules,
            List<String> warnings,
            List<String> blocking) {

        public boolean isImportable() {
            return blocking.isEmpty() && !rules.isEmpty();
        }
    }

    public ParsedSheet parse(String csv) {
        List<String> warnings = new ArrayList<>();
        List<String> blocking = new ArrayList<>();
        List<ParsedRule> rules = new ArrayList<>();

        if (csv == null || csv.isBlank()) {
            blocking.add("The file is empty.");
            return new ParsedSheet(List.of(), warnings, blocking);
        }

        List<List<String>> rows = readCsv(csv);
        if (isItemList(rows)) {
            blocking.add("This is the item list, not the scoring logic. Its rules belong on a "
                    + "sheet with a step heading in column A, a rule code in column A and the "
                    + "logic in column C.");
            return new ParsedSheet(List.of(), warnings, blocking);
        }
        String stage = null;
        String heading = null;
        int stepOrder = 0;
        Set<String> seenNames = new LinkedHashSet<>();
        Map<String, Integer> seenCodes = new LinkedHashMap<>();

        for (int i = 0; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            int sheetRow = i + 1;

            if (isBlank(row)) {
                continue;
            }
            if (isSectionHeading(row)) {
                heading = cell(row, COL_CODE);
                stage = stageOf(heading);
                stepOrder = 0;
                if (stage == null) {
                    // Not fatal: an unrecognised heading means the rules under
                    // it land in the wrong step, which a human can see and move.
                    // Refusing the whole import over it would be worse.
                    warnings.add("Row " + sheetRow + ": could not tell which step \"" + heading
                            + "\" belongs to — its rules were filed under Score computation.");
                    stage = SCORE;
                }
                continue;
            }

            String code = cell(row, COL_CODE);
            String name = cell(row, COL_NAME);
            String logic = cell(row, COL_LOGIC);

            if (logic.isEmpty()) {
                warnings.add("Row " + sheetRow + ": \"" + firstNonEmpty(code, name)
                        + "\" has no logic in column C, so it was skipped.");
                continue;
            }
            if (stage == null) {
                warnings.add("Row " + sheetRow + ": appears before any STEP heading; "
                        + "filed under Score computation.");
                stage = SCORE;
            }

            String ruleName = ruleName(code, name, logic);
            if (!seenNames.add(ruleName.toLowerCase(Locale.ROOT))) {
                // Rule names are unique across the whole installation, so a
                // duplicate inside one sheet is certain to be rejected on save.
                // Saying so now beats a half-written import failing at row 12.
                blocking.add("Row " + sheetRow + ": \"" + ruleName
                        + "\" repeats a name already used earlier in this sheet.");
            }
            Integer firstSeen = seenCodes.putIfAbsent(code.toLowerCase(Locale.ROOT), sheetRow);
            if (firstSeen != null && !code.isEmpty()) {
                warnings.add("Row " + sheetRow + ": code \"" + code
                        + "\" was already used on row " + firstSeen + ".");
            }

            rules.add(new ParsedRule(sheetRow, code, ruleName, logic, stage, ++stepOrder,
                    writesTo(logic)));
        }

        if (rules.isEmpty() && blocking.isEmpty()) {
            blocking.add("No rules found. Expected a code in column A, a name in column B "
                    + "and the logic in column C, under STEP headings.");
        }
        return new ParsedSheet(rules, warnings, blocking);
    }

    /* ===================== structure ===================== */

    /** Column A of an item list's header row. */
    private static final Pattern ITEM_ID_HEADER =
            Pattern.compile("^item[\\s_-]?id$", Pattern.CASE_INSENSITIVE);

    /**
     * Is this the workbook's ITEM sheet rather than its logic sheet?
     *
     * <p>Worth refusing outright, because an item list parses perfectly as
     * rules and that is the whole problem: every row has a code in A, a number
     * in B and a factor name in C, so fifteen rules called "I1 1.0" import with
     * no blockers and distinct names. Nothing downstream can tell them from
     * real ones. The browser now picks the tab by name and by shape
     * (workbookSheets.ts), but the browser is a convenience and this is the
     * record — a CSV posted straight at the API reaches here having been
     * through no picker at all.
     *
     * <p>Matched on column A of an early row and nothing else. A logic sheet's
     * column A holds a step heading or a rule code, never the literal words
     * "Item ID", so this cannot fire on the sheet we want. A looser check —
     * "looks tabular", "has a header row" — could, and refusing a real workbook
     * with no way to see why would be worse than the bug it prevents.
     */
    static boolean isItemList(List<List<String>> rows) {
        int checked = 0;
        for (List<String> row : rows) {
            if (isBlank(row)) {
                continue;
            }
            if (ITEM_ID_HEADER.matcher(cell(row, COL_CODE)).matches()) {
                return true;
            }
            if (++checked >= 5) {
                break;
            }
        }
        return false;
    }

    /**
     * A heading is a row with a label and nothing beside it.
     *
     * <p>Deliberately structural rather than a match on "STEP": the sheet's own
     * last section is headed "EDGE CASES", and a workbook for another
     * instrument may number its steps differently or not at all.
     */
    private static boolean isSectionHeading(List<String> row) {
        return !cell(row, COL_CODE).isEmpty()
                && cell(row, COL_NAME).isEmpty()
                && cell(row, COL_LOGIC).isEmpty();
    }

    /**
     * Which authoring step a heading names.
     *
     * <p>Matched on the words, with the step number only as a fallback, because
     * the words are what stays stable: a workbook that merges reverse-scoring
     * into step 2 and computation into step 3 still says "SCORING" and
     * "COMPUTATION" in both headings.
     */
    public static String stageOf(String heading) {
        String h = heading == null ? "" : heading.toUpperCase(Locale.ROOT);
        if (h.contains("VALIDITY") || h.contains("DATA CAPTURE")) return VALIDITY;
        if (h.contains("EDGE")) return EDGE;
        if (h.contains("BAND") || h.contains("INTERPRETATION BAND")) return BAND;
        if (h.contains("PROFILE")) return PROFILE;
        if (h.contains("REVERSE") || h.contains("SCOR") || h.contains("COMPUT")) return SCORE;
        Matcher m = Pattern.compile("STEP\\s+(\\d+)").matcher(h);
        if (m.find()) {
            switch (m.group(1)) {
                case "0": case "1": return VALIDITY;
                case "2": case "3": return SCORE;
                case "4": return BAND;
                case "5": return PROFILE;
                default: return null;
            }
        }
        return null;
    }

    /**
     * The name the rule assigns to, if it says.
     *
     * <p>Read after the LAST "THEN", which is what separates an assignment from
     * a comparison written with the same '=' character:
     * {@code IF V1 = 5 AND V2 = 5 THEN sd_flag = 'STRONG'} assigns sd_flag and
     * merely tests V1. Sheets that state a bare formula have no THEN, so those
     * fall back to the first assignment in the line — which is the formula's
     * own left-hand side.
     *
     * <p>Comparison operators are excluded by the lookarounds, so {@code >=},
     * {@code <=} and {@code ==} never register as assignments.
     */
    public static String writesTo(String logic) {
        if (logic == null || logic.isBlank()) {
            return null;
        }
        String text = logic;
        int lastThen = text.toUpperCase(Locale.ROOT).lastIndexOf("THEN");
        if (lastThen >= 0) {
            text = text.substring(lastThen + "THEN".length());
        }
        Matcher m = Pattern.compile("([A-Za-z][A-Za-z0-9_]*)\\s*(?<![<>!=])=(?!=)").matcher(text);
        return m.find() ? m.group(1) : null;
    }

    /** "1.1 Infrequency (hard fail)", falling back to whatever the row has. */
    public static String ruleName(String code, String name, String logic) {
        String label = name.isEmpty() ? shorten(logic) : name;
        String full = code.isEmpty() ? label : code + " " + label;
        return full.length() > 160 ? full.substring(0, 160).trim() : full;
    }

    private static String shorten(String logic) {
        String one = logic.replaceAll("\\s+", " ").trim();
        return one.length() <= 60 ? one : one.substring(0, 57).trim() + "...";
    }

    /* ===================== CSV ===================== */

    /**
     * RFC 4180, hand-rolled because it is thirty lines and the alternative is a
     * dependency: neither commons-csv nor POI is on this project's classpath,
     * and adding POI to read three columns would pull ten megabytes of
     * spreadsheet engine into a service that renders PDFs.
     *
     * <p>Quoted fields are what make it worth doing properly rather than
     * splitting on commas — every interesting row in a scoring sheet is quoted,
     * because the logic contains commas:
     * {@code "IF ... THEN band = 'High Drive'. Routing: stretch, autonomy."}
     * A naive split shreds exactly the rules that matter most.
     */
    public static List<List<String>> readCsv(String csv) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;

        // Normalise line endings first so a CRLF file cannot leave a stray \r
        // on the end of every third column — invisible in a diff, and enough to
        // make an exact-match heading check fail for no visible reason.
        String text = csv.replace("\r\n", "\n").replace('\r', '\n');

        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                        field.append('"');
                        i++;
                    } else {
                        quoted = false;
                    }
                } else {
                    field.append(c);
                }
                continue;
            }
            switch (c) {
                case '"' -> quoted = true;
                case ',' -> { row.add(field.toString()); field.setLength(0); }
                case '\n' -> {
                    row.add(field.toString());
                    field.setLength(0);
                    rows.add(row);
                    row = new ArrayList<>();
                }
                default -> field.append(c);
            }
        }
        // A file that does not end in a newline still has a final row, and it is
        // usually the last rule rather than something expendable.
        if (field.length() > 0 || !row.isEmpty()) {
            row.add(field.toString());
            rows.add(row);
        }
        return rows;
    }

    private static String cell(List<String> row, int index) {
        if (index >= row.size()) {
            return "";
        }
        String value = row.get(index);
        return value == null ? "" : value.trim();
    }

    private static boolean isBlank(List<String> row) {
        for (String cell : row) {
            if (cell != null && !cell.isBlank()) {
                return false;
            }
        }
        return true;
    }

    private static String firstNonEmpty(String a, String b) {
        return a.isEmpty() ? (b.isEmpty() ? "(unnamed)" : b) : a;
    }
}
