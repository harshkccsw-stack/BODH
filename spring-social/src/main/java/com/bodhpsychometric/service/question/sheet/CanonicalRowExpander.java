package com.bodhpsychometric.service.question.sheet;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.OptionColumn;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.OptionMode;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.ScalePoint;
import com.bodhpsychometric.service.question.sheet.SheetMappingSpec.ScoringMode;

/**
 * A {@link SheetMappingSpec} plus the sheet it describes → rows of our own
 * questions template. Pure, static, and the only place a foreign sheet becomes
 * something the platform recognises.
 *
 * <h2>Why this is not the model's job</h2>
 *
 * Everything here is mechanical once the shape is known, and doing it in code
 * rather than in a prompt buys four things the plan (§2) leans on: item text is
 * COPIED from its cell rather than retyped, the row count is checkable, cost
 * does not scale with the sheet, and the same sheet expands the same way twice.
 *
 * <h2>Refuses rather than guesses</h2>
 *
 * Anything ambiguous is a blocker. A half-expanded sheet is worse than none:
 * it produces questions that look imported and silently omit an option, a
 * score, or a whole item.
 */
public final class CanonicalRowExpander {

    private CanonicalRowExpander() {
    }

    /** The separator taxonomy paths are written with, matching the app's own MQT labels. */
    public static final String PATH_SEPARATOR = " › ";

    /**
     * One expanded question: the template row itself, plus what it came from.
     * The source row number is what lets the review panel show a sheet row
     * beside its result, which is the check that catches a column read one to
     * the left.
     */
    public record ExpandedRow(
            LinkedHashMap<String, String> cells,
            int sourceRow,
            List<String> path,
            String externalId,
            boolean reverseScored,
            /** The sheet said this item is NOT part of any composite score. */
            boolean excludedFromComposite,
            /** The sheet's presentation-order value, or null when absent or unreadable. */
            Integer adminPosition) {
    }

    /**
     * The one blocker that must NOT be retried, and must not tempt the model
     * into another mode. It is public so the service can recognise it.
     */
    public static final String PER_ROW_TEXT_BLOCKER =
            "This sheet keeps its answer options inside the question text. Answer PER_ROW_TEXT "
            + "with \"confident\": false and say so in \"questions\" — do NOT substitute a scale "
            + "the sheet does not state. (Reading options out of free text is not supported yet.)";

    /**
     * A row that could not become a question, and why.
     *
     * <p>Separate from {@link Expansion#blockers} on purpose. A blocker says
     * the READING is wrong and nothing should be imported; a skip says this
     * one row does not fit — a section preamble sitting in the question
     * table, an item with a single answer — and the other ninety-seven are
     * still good. Refusing the whole workbook over five odd rows is how a
     * correct import becomes no import.
     */
    public record SkippedRow(int row, String why) {
    }

    public record Expansion(
            List<ExpandedRow> rows,
            /** Distinct taxonomy paths, in first-seen order, with how many questions use each. */
            LinkedHashMap<String, Integer> pathCounts,
            List<String> warnings,
            List<String> blockers,
            /** Rows left out, with the reason for each. Not a failure by itself. */
            List<SkippedRow> skipped,
            /** Headers the mapping never referred to — what this import is dropping. */
            List<String> unusedColumns) {

        public boolean ok() {
            return blockers.isEmpty();
        }
    }

    /* ===================== entry point ===================== */

    public static Expansion expand(SheetMappingSpec spec, List<List<String>> grid) {
        List<String> warnings = new ArrayList<>();
        List<String> blockers = new ArrayList<>();
        List<ExpandedRow> rows = new ArrayList<>();
        List<SkippedRow> skipped = new ArrayList<>();
        LinkedHashMap<String, Integer> pathCounts = new LinkedHashMap<>();

        if (spec == null) {
            blockers.add("The mapping could not be read.");
            return new Expansion(rows, pathCounts, warnings, blockers, skipped, List.of());
        }
        if (grid == null || grid.isEmpty()) {
            blockers.add("The sheet is empty.");
            return new Expansion(rows, pathCounts, warnings, blockers, skipped, List.of());
        }
        if (spec.columns() == null || isBlank(spec.columns().stem())) {
            blockers.add("The mapping does not say which column holds the question text.");
            return new Expansion(rows, pathCounts, warnings, blockers, skipped, List.of());
        }

        int headerRow = spec.headerRow() == null ? 1 : spec.headerRow();
        if (headerRow < 1 || headerRow > grid.size()) {
            blockers.add("The mapping points at header row " + headerRow
                    + ", but the sheet has " + grid.size() + " rows.");
            return new Expansion(rows, pathCounts, warnings, blockers, skipped, List.of());
        }

        Map<String, Integer> headers = headerIndex(grid.get(headerRow - 1), blockers);
        if (!blockers.isEmpty()) {
            return new Expansion(rows, pathCounts, warnings, blockers, skipped, List.of());
        }

        SheetMappingSpec.RowRange range = spec.dataRows();
        if (range == null || range.from() == null || range.to() == null) {
            blockers.add("The mapping does not say which rows hold the questions.");
            return new Expansion(rows, pathCounts, warnings, blockers, skipped, List.of());
        }
        if (range.from() <= headerRow) {
            blockers.add("The mapping says the questions start on row " + range.from()
                    + ", which is on or above the header row (" + headerRow + ").");
        }
        if (range.to() > grid.size()) {
            blockers.add("The mapping says the questions end on row " + range.to()
                    + ", but the sheet has " + grid.size() + " rows.");
        }
        if (!blockers.isEmpty()) {
            return new Expansion(rows, pathCounts, warnings, blockers, skipped, List.of());
        }

        // Columns are resolved ONCE, up front: a spec naming a header the sheet
        // does not have is a mapping error, and reporting it per row would bury
        // one fact under fifty copies of itself.
        boolean scoringOn = spec.scoring() != null
                && spec.scoring().mode() != null
                && spec.scoring().mode() != ScoringMode.NONE;
        Columns cols = resolveColumns(spec, headers, blockers);
        Options optionPlan = resolveOptions(spec, headers, scoringOn, blockers);
        Selection selection = resolveSelection(spec, blockers);
        if (!blockers.isEmpty()) {
            return new Expansion(rows, pathCounts, warnings, blockers, skipped, List.of());
        }

        for (int rowNo = range.from(); rowNo <= range.to(); rowNo++) {
            List<String> raw = grid.get(rowNo - 1);
            if (isEntirelyBlank(raw)) {
                warnings.add("Row " + rowNo + " is blank and was skipped.");
                continue;
            }
            expandOne(spec, cols, optionPlan, selection, raw, rowNo,
                    rows, pathCounts, warnings, blockers, skipped);
        }

        if (rows.isEmpty() && blockers.isEmpty()) {
            blockers.add("No questions were found in rows "
                    + range.from() + "–" + range.to() + ".");
        }
        // Odd rows are skipped; a sheet where MOST rows are odd is not a sheet
        // with odd rows, it is a mapping read against the wrong columns — and
        // importing the minority that happened to fit would be the worst
        // outcome of the three.
        if (!rows.isEmpty() && skipped.size() > rows.size()) {
            blockers.add("More rows were left out (" + skipped.size() + ") than imported ("
                    + rows.size() + "), so this reading is probably wrong rather than the sheet.");
        }
        if (cols.order >= 0) {
            checkPresentationOrder(rows, warnings);
        }
        if (cols.excludeFromComposite >= 0) {
            checkCompositeFlags(rows, warnings);
        }
        return new Expansion(rows, pathCounts, warnings, blockers, skipped,
                unusedColumns(grid.get(headerRow - 1), cols, optionPlan));
    }

    /* ===================== sheet-level consistency ===================== */

    /**
     * A presentation-order column that is not exactly 1..n. Step 0.1 of a real
     * scoring workbook cares about the order items were piloted in, so a gap
     * or a repeat is a real difference from what the practitioner tested, not
     * a formatting nit.
     */
    private static void checkPresentationOrder(List<ExpandedRow> rows, List<String> warnings) {
        List<Integer> given = rows.stream().map(ExpandedRow::adminPosition)
                .filter(java.util.Objects::nonNull).toList();
        if (given.isEmpty()) {
            return;
        }
        if (given.size() < rows.size()) {
            warnings.add((rows.size() - given.size()) + " of " + rows.size()
                    + " rows have no presentation order, so the sheet's own order is used.");
            return;
        }
        java.util.TreeSet<Integer> got = new java.util.TreeSet<>(given);
        List<String> problems = new ArrayList<>();
        for (int i = 1; i <= rows.size(); i++) {
            if (!got.contains(i)) {
                problems.add("no item at position " + i);
            }
        }
        if (got.size() < given.size()) {
            problems.add("a position is used more than once");
        }
        if (!problems.isEmpty()) {
            warnings.add("The presentation-order column is not 1–" + rows.size() + ": "
                    + String.join("; ", problems) + ". Items import in the sheet's own order.");
        }
    }

    /**
     * A factor with items both in and out of the composite.
     *
     * <p>Exclusion from a composite is STRUCTURAL in this platform — an item is
     * out because the quality it sits under is not a scoring one. A single
     * factor therefore cannot be half excluded: if the sheet says some of
     * "Internal Drive" counts and some does not, either the sheet is wrong or
     * the excluded items belong under a different quality, and both are worth
     * a person's attention before fifteen questions are created.
     */
    private static void checkCompositeFlags(List<ExpandedRow> rows, List<String> warnings) {
        Map<String, Set<Boolean>> byFactor = new LinkedHashMap<>();
        for (ExpandedRow row : rows) {
            if (row.path().isEmpty()) {
                continue;
            }
            byFactor.computeIfAbsent(row.path().get(0), k -> new LinkedHashSet<>())
                    .add(row.excludedFromComposite());
        }
        byFactor.forEach((factor, flags) -> {
            if (flags.size() > 1) {
                warnings.add("\"" + factor + "\" has items both in and out of the composite score. "
                        + "Exclusion is by quality here, so the excluded items may belong under a "
                        + "different one.");
            }
        });
    }

    /* ===================== one row ===================== */

    private static void expandOne(
            SheetMappingSpec spec, Columns cols, Options optionPlan, Selection selection,
            List<String> raw, int rowNo,
            List<ExpandedRow> rows, LinkedHashMap<String, Integer> pathCounts,
            List<String> warnings, List<String> blockers, List<SkippedRow> skipped) {
        List<String> problems = new ArrayList<>();
        expandRow(spec, cols, optionPlan, selection, raw, rowNo, rows, pathCounts, warnings, problems);
        if (problems.isEmpty()) {
            return;
        }
        // PER_ROW_TEXT is a property of the whole sheet, not of this row, and
        // the service reads it to decide not to retry. It stays a blocker.
        if (problems.contains(PER_ROW_TEXT_BLOCKER)) {
            blockers.addAll(problems);
            return;
        }
        skipped.add(new SkippedRow(rowNo, problems.get(0)));
    }

    private static void expandRow(
            SheetMappingSpec spec, Columns cols, Options optionPlan, Selection selection,
            List<String> raw, int rowNo,
            List<ExpandedRow> rows, LinkedHashMap<String, Integer> pathCounts,
            List<String> warnings, List<String> problems) {

        String stem = cell(raw, cols.stem);
        if (isBlank(stem)) {
            problems.add("Row " + rowNo + " has no question text in the \""
                    + cols.stemHeader + "\" column.");
            return;
        }

        List<String> path = new ArrayList<>();
        for (int idx : cols.path) {
            path.add(cell(raw, idx));
        }
        // Trailing blanks are a shorter path, not an error: a sheet may leave
        // the deepest level empty for items that sit one level up.
        while (!path.isEmpty() && isBlank(path.get(path.size() - 1))) {
            path.remove(path.size() - 1);
        }
        if (path.stream().anyMatch(CanonicalRowExpander::isBlank)) {
            problems.add("Row " + rowNo + " has a gap in its quality path ("
                    + String.join(" / ", path) + ") — a level cannot be skipped.");
            return;
        }
        for (String segment : path) {
            if (segment.contains(":") || segment.contains("|")) {
                problems.add("Row " + rowNo + ": the quality name \"" + segment
                        + "\" contains ':' or '|', which the score column uses as separators.");
                return;
            }
        }

        Boolean reverse = reverseFlag(spec, cols, raw, rowNo, problems);
        if (reverse == null) {
            return;
        }

        Scale found = optionPlan.pointsFor(raw, rowNo, problems);
        if (found == null) {
            return;
        }
        List<ScalePoint> scale = found.points();
        if (scale.size() < 2) {
            problems.add("Row " + rowNo + " would import with "
                    + (scale.isEmpty() ? "no options" : "one option") + ".");
            return;
        }

        boolean scoring = spec.scoring() != null
                && spec.scoring().mode() != null
                && spec.scoring().mode() != ScoringMode.NONE;
        String pathKey = String.join(PATH_SEPARATOR, path);
        // A sheet whose score cells name their own quality ("Self-Efficacy:1")
        // needs no path column: the cell says what the row would have said.
        if (scoring && path.isEmpty() && !found.hasNamed()) {
            warnings.add("Row " + rowNo + " names no measured quality, so it imports unscored.");
            scoring = false;
        }

        // Reverse scoring is (min + max) - value, computed from the scale this
        // row actually uses. The reference sheet's note says "6 - raw" because
        // its scale is 1-5; a 0-4 scale reverses at 4, and a hardcoded 6 would
        // import negative scores that still look like numbers.
        //
        // From the VALUED points only. An option with no value is unscored, not
        // worth zero: treating it as 0 would drag the pivot down and — worse —
        // reverse scoring would then turn "no score" into the scale's maximum.
        java.util.DoubleSummaryStatistics valued = scale.stream()
                .filter(pt -> pt.value() != null)
                .mapToDouble(ScalePoint::value)
                .summaryStatistics();
        double pivot = valued.getCount() == 0 ? 0 : valued.getMin() + valued.getMax();

        boolean excluded = cols.excludeFromComposite >= 0
                && falsy(cell(raw, cols.excludeFromComposite));
        Integer adminPosition = parsePosition(cell(raw, cols.order));

        LinkedHashMap<String, String> cells = new LinkedHashMap<>();
        cells.put("stem", stem);
        cells.put("description", cell(raw, cols.description));
        cells.put("type", "TEXT");
        cells.put("mediaUrl", "");
        cells.put("risk", truthy(cell(raw, cols.risk)) ? "yes" : "");
        // Ordinal by construction — a scale delivered out of order is broken,
        // not randomised, so this is never set by an import.
        cells.put("shuffle", "");
        cells.put("selectRule", selection.rule());
        cells.put("selectCount", selection.count() == null ? "" : String.valueOf(selection.count()));
        cells.put("section", sectionName(spec, cell(raw, cols.section)));
        // Question-level scores stay empty: a scored item's numbers live on its
        // options, which is what reverse scoring needs and what the
        // item-binding lint expects to find.
        cells.put("scores", "");

        // Counted per QUESTION, not per option: pathCounts is what the review
        // panel prints as "n questions", and a five-option item naming one
        // quality five times is one question, not five.
        Set<String> namedHere = new LinkedHashSet<>();
        for (int i = 0; i < scale.size(); i++) {
            ScalePoint point = scale.get(i);
            int n = i + 1;
            cells.put("option" + n, point.text() == null ? "" : point.text().trim());
            cells.put("option" + n + "Description", "");
            String scoreCell = "";
            String named = found.namedAt(i);
            if (scoring && named != null) {
                // The cell already says quality AND score; only reverse
                // scoring has anything left to do to it.
                scoreCell = reverse ? reverseNamed(named, pivot) : normaliseNamed(named);
                for (NamedScore pair : namedScores(named)) {
                    namedHere.add(pair.name());
                }
            } else if (scoring && !path.isEmpty() && point.value() != null) {
                double v = reverse ? pivot - point.value() : point.value();
                scoreCell = pathKey + ":" + trimNumber(v);
            }
            cells.put("option" + n + "Scores", scoreCell);
        }
        for (String name : namedHere) {
            pathCounts.merge(name, 1, Integer::sum);
        }

        if (scoring && !path.isEmpty() && !found.hasNamed()) {
            pathCounts.merge(pathKey, 1, Integer::sum);
        }
        rows.add(new ExpandedRow(cells, rowNo, List.copyOf(path),
                cell(raw, cols.externalId), reverse, excluded, adminPosition));
    }

    /* ===================== how many options may be picked ===================== */

    /** Normalised to what the template accepts; empty rule = single choice. */
    private record Selection(String rule, Integer count) {
    }

    private static final Map<String, String> SELECT_RULES = Map.ofEntries(
            Map.entry("min", "min"), Map.entry("atleast", "min"), Map.entry("minimum", "min"),
            Map.entry("max", "max"), Map.entry("atmost", "max"), Map.entry("upto", "max"),
            Map.entry("uptoandincluding", "max"), Map.entry("maximum", "max"),
            Map.entry("equals", "equals"), Map.entry("equal", "equals"),
            Map.entry("exactly", "equals"), Map.entry("exact", "equals"));

    /**
     * The selection rule, or a blocker.
     *
     * <p>Refused rather than dropped, and this is the interesting decision. The
     * field means "how many of this row's options may the respondent pick", and
     * a model reading a sheet full of instructions will sometimes put an
     * instruction in it — a real workbook produced {@code selectRule:
     * "Admin_Position order", selectCount: 15} from a note about presentation
     * order. Ignoring an unrecognised value would also silently drop a genuine
     * "pick at most 2", so the rule is: understood, blank, or stop. A blocker
     * here reaches the model's one retry with the field named, which is where
     * this usually gets fixed without anyone seeing it.
     */
    private static Selection resolveSelection(SheetMappingSpec spec, List<String> blockers) {
        SheetMappingSpec.SelectionSpec selection = spec.selection();
        if (selection == null || isBlank(selection.rule())) {
            // Both blank is single choice — what every sheet written before
            // these columns existed means, so this is the safe default.
            if (selection != null && selection.count() != null) {
                blockers.add("The mapping gives a selection count of " + selection.count()
                        + " with no rule to apply it to.");
            }
            return new Selection("", null);
        }
        String key = selection.rule().trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z]", "");
        String rule = SELECT_RULES.get(key);
        if (rule == null) {
            blockers.add("The mapping says questions allow \"" + selection.rule().trim()
                    + "\" answers. That field is how many options a respondent may pick, and it "
                    + "must be min, max or equals — leave it out for a single-choice question.");
            return new Selection("", null);
        }
        Integer count = selection.count();
        if (count == null || count < 1) {
            blockers.add("The mapping says \"" + rule + "\" but does not say how many options.");
            return new Selection("", null);
        }
        return new Selection(rule, count);
    }

    /* ===================== reverse flag ===================== */

    /** Null means "stop" — a blocker has been recorded. */
    private static Boolean reverseFlag(SheetMappingSpec spec, Columns cols, List<String> raw,
            int rowNo, List<String> problems) {
        if (cols.reverse < 0) {
            return Boolean.FALSE;
        }
        String cellValue = cell(raw, cols.reverse).trim();
        if (cellValue.isEmpty()) {
            return Boolean.FALSE;
        }
        SheetMappingSpec.ReverseSpec rev = spec.scoring() == null ? null : spec.scoring().reverseWhen();
        Set<String> yes = normalisedSet(rev == null ? null : rev.truthy(), "y", "yes", "true", "1", "r", "reverse");
        Set<String> no = normalisedSet(rev == null ? null : rev.falsy(), "n", "no", "false", "0", "-");
        String key = cellValue.toLowerCase(Locale.ROOT);
        if (yes.contains(key)) {
            return Boolean.TRUE;
        }
        if (no.contains(key)) {
            return Boolean.FALSE;
        }
        // Deliberately fatal. Reading an unrecognised flag as "not reversed"
        // would invert nothing and say nothing, and the resulting scores are
        // wrong in a way no later screen can show.
        problems.add("Row " + rowNo + ": the reverse-scoring column says \"" + cellValue
                + "\", which is neither yes nor no.");
        return null;
    }

    /* ===================== columns ===================== */

    private record Columns(int stem, String stemHeader, int description, int externalId,
            int order, List<Integer> path, int reverse, int excludeFromComposite,
            int risk, int section) {
    }

    private static Columns resolveColumns(SheetMappingSpec spec, Map<String, Integer> headers,
            List<String> blockers) {
        SheetMappingSpec.ColumnMap c = spec.columns();
        int stem = require(c.stem(), headers, blockers, "question text");
        List<Integer> path = new ArrayList<>();
        if (c.path() != null) {
            for (String header : c.path()) {
                if (isBlank(header)) {
                    continue;
                }
                int idx = require(header, headers, blockers, "measured quality");
                if (idx >= 0) {
                    path.add(idx);
                }
            }
        }
        return new Columns(stem, c.stem(), optional(c.description(), headers, blockers),
                optional(c.externalId(), headers, blockers), optional(c.order(), headers, blockers),
                path, optional(c.reverse(), headers, blockers),
                optional(c.excludeFromComposite(), headers, blockers),
                optional(c.risk(), headers, blockers), optional(c.section(), headers, blockers));
    }

    private static int require(String header, Map<String, Integer> headers, List<String> blockers,
            String what) {
        if (isBlank(header)) {
            blockers.add("The mapping does not name a column for the " + what + ".");
            return -1;
        }
        Integer idx = headers.get(normalise(header));
        if (idx == null) {
            blockers.add("The mapping reads the " + what + " from a column called \"" + header
                    + "\", which is not in the sheet.");
            return -1;
        }
        return idx;
    }

    private static int optional(String header, Map<String, Integer> headers, List<String> blockers) {
        if (isBlank(header)) {
            return -1;
        }
        Integer idx = headers.get(normalise(header));
        if (idx == null) {
            blockers.add("The mapping names a column called \"" + header
                    + "\", which is not in the sheet.");
            return -1;
        }
        return idx;
    }

    private static Map<String, Integer> headerIndex(List<String> headerRow, List<String> blockers) {
        Map<String, Integer> out = new HashMap<>();
        Set<String> duplicates = new LinkedHashSet<>();
        for (int i = 0; i < headerRow.size(); i++) {
            String key = normalise(headerRow.get(i));
            if (key.isEmpty()) {
                continue;
            }
            if (out.putIfAbsent(key, i) != null) {
                duplicates.add(headerRow.get(i).trim());
            }
        }
        // Two columns of the same name make every reference to it a coin flip,
        // and the wrong one imports silently.
        for (String dup : duplicates) {
            blockers.add("The sheet has more than one column called \"" + dup + "\".");
        }
        if (out.isEmpty()) {
            blockers.add("The header row is empty.");
        }
        return out;
    }

    /* ===================== options ===================== */

    /**
     * A row's options: the points, and — for a sheet that scores each option
     * against a quality it NAMES ("Self-Efficacy:1") — the cell to carry
     * through for each of them. `named` is null for every other sheet, which
     * is all of them until one does this.
     */
    private record Scale(List<ScalePoint> points, List<String> named) {

        static Scale of(List<ScalePoint> points) {
            return new Scale(points, null);
        }

        String namedAt(int i) {
            String at = named == null || i >= named.size() ? null : named.get(i);
            return at == null || at.isBlank() ? null : at;
        }

        boolean hasNamed() {
            return named != null && named.stream().anyMatch(n -> n != null && !n.isBlank());
        }
    }

    /**
     * Headers the mapping never referred to.
     *
     * <p>Computed from the resolved indices rather than asked of the model,
     * because "what did you ignore?" is exactly the question a model answers
     * optimistically. Every column the sheet has and the reading does not use
     * is a piece of the author's work being dropped — a question type, a
     * selection limit, an option's help text — and the only general defence
     * against dropping it silently is to say so before anything is created.
     */
    private static List<String> unusedColumns(List<String> headerRow, Columns cols, Options options) {
        Set<Integer> used = new LinkedHashSet<>();
        used.add(cols.stem);
        used.add(cols.description);
        used.add(cols.externalId);
        used.add(cols.order);
        used.add(cols.reverse);
        used.add(cols.excludeFromComposite);
        used.add(cols.risk);
        used.add(cols.section);
        used.addAll(cols.path);
        used.addAll(options.columnIdx());
        used.addAll(options.columnScoreIdx());
        used.add(options.scaleColumnIdx());

        List<String> out = new ArrayList<>();
        for (int i = 0; i < headerRow.size(); i++) {
            String header = headerRow.get(i);
            if (!used.contains(i) && !isBlank(header)) {
                out.add(header.trim());
            }
        }
        return out;
    }

    /**
     * The section this row belongs to, by NAME.
     *
     * <p>A sheet that carries a section ID and keeps the names on another tab
     * is the ordinary case, not an exotic one — so when the spec brought a
     * dictionary back, the id is translated here, once, and everything
     * downstream sees a real name. An id the dictionary does not cover is
     * left exactly as it was found: visible and wrong beats invented.
     */
    private static String sectionName(SheetMappingSpec spec, String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty() || spec.sections() == null || spec.sections().isEmpty()) {
            return value;
        }
        for (Map.Entry<String, SheetMappingSpec.SectionInfo> entry : spec.sections().entrySet()) {
            if (sameKey(entry.getKey(), value)
                    && entry.getValue() != null && !isBlank(entry.getValue().name())) {
                return entry.getValue().name().trim();
            }
        }
        return value;
    }

    /**
     * Section ids compared the way a spreadsheet forces: "55" from the model
     * against "55.0" out of a numeric cell, either of them padded.
     */
    private static boolean sameKey(String a, String b) {
        return normaliseLoose(dropTrailingZero(a)).equals(normaliseLoose(dropTrailingZero(b)));
    }

    private static String dropTrailingZero(String s) {
        String t = s == null ? "" : s.trim();
        return t.matches("-?\\d+\\.0+") ? t.substring(0, t.indexOf('.')) : t;
    }

    /** One "quality:score" pair out of a score cell. */
    private record NamedScore(String name, double score) {
    }

    /**
     * "Self-Efficacy:1", or "Focus:2 | Drive:0.5" — the syntax our own
     * template uses for option scores, which sheets written against it (and
     * sheets exported from this platform) naturally carry.
     *
     * @return the pairs, or null when the cell is not that shape at all —
     *         which is a blocker, exactly as a non-numeric score always was
     */
    private static List<NamedScore> namedScores(String cell) {
        List<NamedScore> out = new ArrayList<>();
        for (String part : cell.split("\\|")) {
            String piece = part.trim();
            if (piece.isEmpty()) {
                continue;
            }
            int at = piece.lastIndexOf(':');
            if (at <= 0 || at == piece.length() - 1) {
                return null;
            }
            String name = piece.substring(0, at).trim();
            try {
                if (name.isEmpty()) {
                    return null;
                }
                out.add(new NamedScore(name, Double.parseDouble(piece.substring(at + 1).trim())));
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return out.isEmpty() ? null : out;
    }

    /** The same pairs, spaced the way the template writes them. */
    private static String normaliseNamed(String cell) {
        List<NamedScore> pairs = namedScores(cell);
        if (pairs == null) {
            return cell;
        }
        return pairs.stream()
                .map(p -> p.name() + ":" + trimNumber(p.score()))
                .reduce((a, b) -> a + " | " + b)
                .orElse("");
    }

    /**
     * Reverse scoring, applied to a cell that names its own qualities. The
     * pivot is the row's own scale (min + max of its valued points), exactly
     * as for a numeric score — with several pairs in one cell every number is
     * a point on that same scale, so they all reverse against it.
     */
    private static String reverseNamed(String cell, double pivot) {
        List<NamedScore> pairs = namedScores(cell);
        if (pairs == null) {
            return cell;
        }
        return pairs.stream()
                .map(p -> p.name() + ":" + trimNumber(pivot - p.score()))
                .reduce((a, b) -> a + " | " + b)
                .orElse("");
    }

    private record Options(OptionMode mode, List<ScalePoint> shared, List<OptionColumn> columns,
            List<Integer> columnIdx, List<Integer> columnScoreIdx, int scaleColumnIdx,
            Map<String, List<ScalePoint>> scales) {

        /** Null means "stop" — a blocker has been recorded. */
        Scale pointsFor(List<String> raw, int rowNo, List<String> problems) {
            switch (mode) {
                case SHARED_SCALE:
                    return Scale.of(shared);
                case SCALE_COLUMN: {
                    String key = cell(raw, scaleColumnIdx).trim();
                    List<ScalePoint> found = scales.get(normaliseLoose(key));
                    if (found == null) {
                        problems.add("Row " + rowNo + " uses a scale called \"" + key
                                + "\", which the mapping does not define.");
                        return null;
                    }
                    return Scale.of(found);
                }
                case COLUMNS: {
                    List<ScalePoint> out = new ArrayList<>();
                    List<String> named = new ArrayList<>();
                    for (int i = 0; i < columnIdx.size(); i++) {
                        String text = cell(raw, columnIdx.get(i));
                        if (isBlank(text)) {
                            continue; // a spare option column, which is ordinary
                        }
                        Double v = null;
                        String namedScore = null;
                        int scoreIdx = columnScoreIdx.get(i);
                        if (scoreIdx >= 0) {
                            String rawScore = cell(raw, scoreIdx).trim();
                            if (!rawScore.isEmpty()) {
                                try {
                                    v = Double.valueOf(rawScore);
                                } catch (NumberFormatException e) {
                                    // Not a bare number — but "Self-Efficacy:1"
                                    // is not a broken cell, it is a sheet that
                                    // says which quality each option scores.
                                    // Sheets written that way are common enough
                                    // (it is our own template's syntax) that
                                    // refusing them cost a whole import.
                                    List<NamedScore> pairs = namedScores(rawScore);
                                    if (pairs == null) {
                                        problems.add("Row " + rowNo + ": the score for option \""
                                                + text.trim() + "\" is \"" + rawScore
                                                + "\", which is neither a number nor \"quality:number\".");
                                        return null;
                                    }
                                    namedScore = rawScore;
                                    v = pairs.get(0).score();
                                }
                            }
                        }
                        out.add(new ScalePoint(text, v));
                        named.add(namedScore);
                    }
                    return new Scale(out, named);
                }
                default:
                    problems.add("Row " + rowNo + ": options embedded in free text are not supported yet.");
                    return null;
            }
        }
    }

    private static Options resolveOptions(SheetMappingSpec spec, Map<String, Integer> headers,
            boolean scoring, List<String> blockers) {
        SheetMappingSpec.OptionSpec o = spec.options();
        if (o == null || o.mode() == null) {
            blockers.add("The mapping does not say where the answer options come from.");
            return new Options(OptionMode.SHARED_SCALE, List.of(), List.of(), List.of(), List.of(), -1, Map.of());
        }
        switch (o.mode()) {
            case SHARED_SCALE: {
                List<ScalePoint> scale = checkedScale(o.scale(), "the shared scale", scoring, blockers);
                return new Options(OptionMode.SHARED_SCALE, scale, List.of(), List.of(), List.of(), -1, Map.of());
            }
            case SCALE_COLUMN: {
                int idx = require(o.scaleColumn(), headers, blockers, "scale name");
                Map<String, List<ScalePoint>> scales = new HashMap<>();
                if (o.scales() == null || o.scales().isEmpty()) {
                    blockers.add("The mapping says each row names its own scale but defines none.");
                } else {
                    o.scales().forEach((name, points) -> {
                        // Dictionary keys are free-text labels the model chose and
                        // the sheet repeats, so they drift by punctuation far more
                        // than headers do: "Yes/No" against "yesno". Matched loosely
                        // for that reason — and two keys that collide under it are
                        // refused, because picking one silently would score a whole
                        // row against the wrong scale.
                        List<ScalePoint> clash = scales.put(normaliseLoose(name),
                                checkedScale(points, "the scale \"" + name + "\"", scoring, blockers));
                        if (clash != null) {
                            blockers.add("The mapping defines two scales whose names differ only "
                                    + "in punctuation or case (\"" + name + "\").");
                        }
                    });
                }
                return new Options(OptionMode.SCALE_COLUMN, List.of(), List.of(), List.of(), List.of(), idx, scales);
            }
            case COLUMNS: {
                List<Integer> text = new ArrayList<>();
                List<Integer> score = new ArrayList<>();
                if (o.columns() == null || o.columns().isEmpty()) {
                    blockers.add("The mapping says the options are in columns but names none.");
                } else {
                    for (OptionColumn col : o.columns()) {
                        text.add(require(col.textColumn(), headers, blockers, "an answer option"));
                        score.add(optional(col.scoreColumn(), headers, blockers));
                    }
                }
                return new Options(OptionMode.COLUMNS, List.of(), o.columns() == null ? List.of() : o.columns(),
                        text, score, -1, Map.of());
            }
            default:
                blockers.add(PER_ROW_TEXT_BLOCKER);
                return new Options(OptionMode.PER_ROW_TEXT, List.of(), List.of(), List.of(), List.of(), -1, Map.of());
        }
    }

    private static List<ScalePoint> checkedScale(List<ScalePoint> scale, String what,
            boolean scoring, List<String> blockers) {
        if (scale == null || scale.size() < 2) {
            blockers.add("The mapping defines " + what + " with fewer than two options.");
            return List.of();
        }
        // A DECLARED scale on a scored sheet must value every point. Per-row
        // option columns may legitimately leave one blank; a scale that the
        // whole sheet shares cannot, because a scored question would then be
        // half scored and nobody would see which half.
        if (scoring && scale.stream().anyMatch(pt -> pt != null && pt.value() == null)) {
            blockers.add("The mapping defines " + what + " with an option that has no value, "
                    + "but the sheet is scored. Give every option a number, or set scoring to NONE.");
            return List.of();
        }
        Set<String> seenText = new LinkedHashSet<>();
        Set<Double> seenValue = new LinkedHashSet<>();
        for (ScalePoint point : scale) {
            if (point == null || isBlank(point.text())) {
                blockers.add("The mapping defines " + what + " with an unnamed option.");
                return List.of();
            }
            if (!seenText.add(normalise(point.text()))) {
                blockers.add("The mapping defines " + what + " with two options called \""
                        + point.text().trim() + "\".");
                return List.of();
            }
            if (point.value() != null && !seenValue.add(point.value())) {
                // Two options worth the same is legal in general, but on a
                // scale it means the model lost a number, and reverse scoring
                // would then pivot around the wrong midpoint.
                blockers.add("The mapping defines " + what + " with two options worth "
                        + trimNumber(point.value()) + ".");
                return List.of();
            }
        }
        return List.copyOf(scale);
    }

    /* ===================== small helpers ===================== */

    private static boolean falsy(String raw) {
        String v = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        return v.equals("n") || v.equals("no") || v.equals("false") || v.equals("0");
    }

    /** "3", "3.0" and " 3 " are all position 3; anything else is null. */
    private static Integer parsePosition(String raw) {
        if (isBlank(raw)) {
            return null;
        }
        try {
            double d = Double.parseDouble(raw.trim());
            return d == Math.rint(d) ? (int) d : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String trimNumber(double v) {
        double rounded = Math.round(v * 100) / 100d;
        return rounded == Math.rint(rounded)
                ? String.valueOf((long) rounded)
                : String.valueOf(rounded);
    }

    private static Set<String> normalisedSet(List<String> given, String... fallback) {
        Set<String> out = new LinkedHashSet<>();
        if (given != null && !given.isEmpty()) {
            for (String s : given) {
                if (!isBlank(s)) {
                    out.add(s.trim().toLowerCase(Locale.ROOT));
                }
            }
        }
        if (out.isEmpty()) {
            for (String s : fallback) {
                out.add(s);
            }
        }
        return out;
    }

    private static boolean truthy(String raw) {
        String v = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        return v.equals("y") || v.equals("yes") || v.equals("true") || v.equals("1");
    }

    private static String cell(List<String> row, int idx) {
        if (idx < 0 || row == null || idx >= row.size()) {
            return "";
        }
        String v = row.get(idx);
        return v == null ? "" : v.trim();
    }

    private static boolean isEntirelyBlank(List<String> row) {
        return row == null || row.stream().allMatch(CanonicalRowExpander::isBlank);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /** Case, space, underscore and hyphen insensitive — how headers really vary. */
    static String normalise(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("[\\s_-]", "");
    }

    /**
     * Everything non-alphanumeric stripped. Used ONLY for scale dictionary
     * keys, never for headers: two headers called "Score" and "Score %" are
     * genuinely different columns, and collapsing them would read the wrong
     * one without saying so.
     */
    static String normaliseLoose(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }
}
