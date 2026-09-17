package com.bodhpsychometric.service.question.sheet;

import java.util.List;
import java.util.Map;

/**
 * How to read somebody else's question sheet — the model's entire output.
 *
 * <p>This is a description of SHAPE, and deliberately holds no item text. The
 * model says which column the stems are in; {@link CanonicalRowExpander} reads
 * that column out of the sheet itself. So the single most damaging thing a
 * model could do here — quietly reword a psychometric item — is not something
 * this type can express. See docs/ai-sheet-to-questions-plan.md §2.
 *
 * <p>Every field is optional as far as Jackson is concerned, because the model
 * is capable of omitting anything; {@link CanonicalRowExpander#expand} decides
 * what is actually required and refuses rather than guessing.
 *
 * <p>Row numbers are 1-BASED throughout, matching what a person sees in Excel.
 */
public record SheetMappingSpec(
        String sheet,
        Integer headerRow,
        RowRange dataRows,
        List<IgnoredRange> ignoredRows,
        ColumnMap columns,
        OptionSpec options,
        ScoringSpec scoring,
        SelectionSpec selection,
        List<String> unmapped,
        List<String> notes,
        Boolean confident,
        List<String> questions) {

    /** Inclusive, 1-based, as read in the spreadsheet. */
    public record RowRange(Integer from, Integer to) {
        public int size() {
            return from == null || to == null ? 0 : Math.max(0, to - from + 1);
        }
    }

    public record IgnoredRange(Integer from, Integer to, String why) {
    }

    /**
     * Canonical field → the source sheet's header for it. Null means the sheet
     * does not carry that field, which is legal for everything except
     * {@code stem}.
     *
     * <p>{@code path} is a LIST because the taxonomy is a tree of arbitrary
     * depth and a sheet may name one level or five — {@code ["Factor",
     * "Construct"]} for the reference workbook. Order is root-first; that is
     * the path §5.1 resolves left to right.
     */
    public record ColumnMap(
            String stem,
            String description,
            String externalId,
            String order,
            List<String> path,
            String reverse,
            String excludeFromComposite,
            String risk,
            String section) {
    }

    /** Where a row's answer options come from. */
    public enum OptionMode {
        /** One option per named column pair. */
        COLUMNS,
        /** One scale, stated once, used by every row. */
        SHARED_SCALE,
        /** A column names which scale this row uses; {@code scales} is the dictionary. */
        SCALE_COLUMN,
        /** Options are embedded in free text and were extracted per row. */
        PER_ROW_TEXT;

        /**
         * Case- and separator-insensitive. A model that writes "shared scale"
         * instead of "SHARED_SCALE" has understood the sheet perfectly and
         * would otherwise cost a whole extra round trip to say so.
         */
        @com.fasterxml.jackson.annotation.JsonCreator
        public static OptionMode of(String raw) {
            return lenient(OptionMode.class, raw);
        }
    }

    public record OptionSpec(
            OptionMode mode,
            /** Where in the sheet the model found this — quoted back to the reviewer. */
            String evidence,
            List<ScalePoint> scale,
            List<OptionColumn> columns,
            String scaleColumn,
            Map<String, List<ScalePoint>> scales) {
    }

    /**
     * One answer option and the number it is worth. {@code value} is what
     * becomes the MQT score, so it is the field reverse scoring inverts.
     */
    public record ScalePoint(String text, Double value) {
    }

    public record OptionColumn(String textColumn, String scoreColumn, String descriptionColumn) {
    }

    public enum ScoringMode {
        /** Each option's value scores the MQT the row's path names. The usual case. */
        OPTION_VALUE_TO_ROW_MQT,
        /** The sheet carries no scoring information; options import unscored. */
        NONE;

        @com.fasterxml.jackson.annotation.JsonCreator
        public static ScoringMode of(String raw) {
            return lenient(ScoringMode.class, raw);
        }
    }

    private static <E extends Enum<E>> E lenient(Class<E> type, String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String key = raw.trim().toUpperCase(java.util.Locale.ROOT).replaceAll("[^A-Z]", "");
        for (E value : type.getEnumConstants()) {
            if (value.name().replace("_", "").equals(key)) {
                return value;
            }
        }
        return null;
    }

    public record ScoringSpec(ScoringMode mode, ReverseSpec reverseWhen) {
    }

    /**
     * Which column flags a reverse-scored item, and which of its values mean
     * yes. Anything in neither list stops the import — a {@code Reverse_Scored}
     * cell holding {@code R} must not be read as "not reversed".
     */
    public record ReverseSpec(String column, List<String> truthy, List<String> falsy) {
    }

    /** Null rule = single choice, which is what every existing sheet means. */
    public record SelectionSpec(String rule, Integer count) {
    }

    public boolean isConfident() {
        return !Boolean.FALSE.equals(confident);
    }
}
