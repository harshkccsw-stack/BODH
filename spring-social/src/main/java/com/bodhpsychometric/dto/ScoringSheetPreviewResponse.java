package com.bodhpsychometric.dto;

import java.util.List;

/**
 * What a workbook would create, shown before anything is written.
 *
 * <p>Nothing here is saved. The practitioner sees every rule the sheet yielded,
 * confirms it, and only then does the import run — which matters because rule
 * names are unique for the whole installation, so a clash is far cheaper to
 * discover on this screen than halfway through writing twenty rows.
 *
 * @param blocking reasons the import cannot run at all. Empty means it can.
 * @param warnings things worth seeing that do not stop the import.
 * @param groups rules that compete to fill the same placeholder — the
 *        "show the first match or show all of them?" question.
 */
public record ScoringSheetPreviewResponse(
        List<DraftRule> rules,
        List<String> warnings,
        List<String> blocking,
        List<SelectionGroup> groups) {

    /**
     * @param nameTaken a rule of this name already exists. Blocking, but
     *        reported per row rather than as one refusal, so the practitioner
     *        can see which rows to rename instead of guessing.
     */
    public record DraftRule(
            int sheetRow,
            String code,
            String name,
            String slug,
            String stage,
            int stepOrder,
            String logicText,
            String writesTo,
            boolean nameTaken) {
    }

    /**
     * Several rules assigning the same name — 4.1/4.2/4.3 all setting
     * {@code band}, or 5.1/5.2/5.3 all setting {@code profile_note}.
     *
     * <p>Only groups of two or more are reported: one rule filling a
     * placeholder is not a choice, and asking about it would be noise.
     */
    public record SelectionGroup(
            String writesTo,
            String stage,
            List<String> ruleNames) {
    }
}
