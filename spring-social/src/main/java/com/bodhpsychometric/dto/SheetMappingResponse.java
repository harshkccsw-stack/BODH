package com.bodhpsychometric.dto;

import java.util.List;
import java.util.Map;

import com.bodhpsychometric.service.question.sheet.SheetMappingSpec;

/**
 * What a foreign sheet would become. <b>Writes nothing.</b>
 *
 * <p>{@code rows} are rows of the ordinary questions template — the same shape
 * the download hands out and the same shape the manual upload reads. That is
 * the whole design: the model's work ends at a file the existing importer
 * already understands, and the approve path runs the same validator as a
 * hand-typed sheet.
 */
public record SheetMappingResponse(
        boolean ok,
        /** Which tab was read. */
        String sheet,
        /** "How I read your sheet", in plain English, for the review panel. */
        String summary,
        SheetMappingSpec spec,
        List<Map<String, String>> rows,
        List<RowSource> sources,
        List<PathProposal> paths,
        List<DuplicateStem> duplicates,
        List<String> warnings,
        List<String> blockers,
        boolean confident,
        /** What the model says it could not tell. Not an error. */
        List<String> questions,
        String model) {

    /**
     * Where one expanded row came from. The source row number is what lets the
     * panel show a sheet row beside its result — the check that catches a
     * column read one to the left faster than any amount of prose.
     */
    public record RowSource(
            int sourceRow,
            List<String> path,
            String pathKey,
            String externalId,
            boolean reverseScored,
            /** The sheet flagged this item as outside every composite score. */
            boolean excludedFromComposite) {
    }

    /**
     * A question this sheet would create whose wording is already in the bank.
     *
     * <p>A WARNING and never a blocker: a new instrument may legitimately reuse
     * a standard item, and only the person importing knows which it is. But
     * importing the same sheet twice is the mistake this whole feature makes
     * easy, and nothing else in the flow would notice it.
     */
    public record DuplicateStem(
            /** Index into {@code rows}. */
            int index,
            int sourceRow,
            Long existingQuestionId,
            /** EXACT | NORMALISED — whether the wording matched letter for letter. */
            String method) {
    }

    /** One taxonomy path, and how much of it already exists. */
    public record PathProposal(
            String pathKey,
            int questionCount,
            boolean fullyResolved,
            boolean needsPick,
            List<PathSegment> segments) {
    }

    public record PathSegment(
            String name,
            /** MATCHED | MATCHED_NORMALISED | CREATE | AMBIGUOUS */
            String status,
            Long mqId,
            Long mqtId,
            Long parentMqId,
            Long parentMqtId,
            String note,
            /** What the note is about, for a one-click action. Null when there is no note. */
            Long suggestedMqtId,
            String suggestedPath) {
    }
}
