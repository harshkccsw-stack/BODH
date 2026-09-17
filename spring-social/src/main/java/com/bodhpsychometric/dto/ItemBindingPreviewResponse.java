package com.bodhpsychometric.dto;

import java.util.List;

/**
 * What importing an item sheet would do, before it does any of it.
 *
 * <p>A diff and not a count. A re-import updates bindings IN PLACE — there is
 * no version history to fall back on — so the review screen is the only place
 * a practitioner can see that item {@code I7} is about to stop meaning the
 * question it has meant all along.
 */
public record ItemBindingPreviewResponse(
        Long assessmentId,
        List<Row> rows,
        /**
         * Item codes stored for this assessment that the new sheet does not
         * contain. The sheet is the authority, so these are deleted — named
         * here because a silent delete is how a rule quietly loses its meaning.
         */
        List<String> removed,
        /** Placed questions, for the reviewer's manual picker. */
        List<QuestionOption> candidates,
        List<String> warnings,
        List<String> blocking) {

    /** Change kinds, in the order the review screen should draw attention to them. */
    public static final String NEW = "NEW";
    public static final String REMATCHED = "REMATCHED";
    public static final String FLAGS_CHANGED = "FLAGS_CHANGED";
    public static final String CHANGED = "CHANGED";
    public static final String UNCHANGED = "UNCHANGED";

    public boolean isImportable() {
        return blocking.isEmpty() && !rows.isEmpty();
    }

    /**
     * One item, as the sheet states it and as it resolved.
     *
     * @param matchMethod EXACT / NORMALISED / FUZZY / MANUAL / NONE
     * @param note        why it failed, or what to look at in a fuzzy match
     * @param change      what this import would do to an existing binding
     */
    public record Row(
            int sheetRow,
            String itemCode,
            Integer adminPosition,
            String factor,
            String construct,
            String statement,
            boolean reverseScored,
            boolean inComposite,
            Long questionId,
            /** The placement row, kept so §7's order lint has something to read. */
            Long questionnaireQuestionId,
            String questionTag,
            String questionStem,
            Long mqId,
            String mqName,
            Long mqtId,
            String mqtPath,
            String matchMethod,
            String note,
            String change) {
    }

    /** A question the reviewer may bind an item to by hand. */
    public record QuestionOption(Long questionId, String questionTag, int sortOrder, String stem) {
    }
}
