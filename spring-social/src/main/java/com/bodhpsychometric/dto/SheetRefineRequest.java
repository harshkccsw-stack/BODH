package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.dto.SheetMappingRequest.SheetCsv;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import tools.jackson.databind.JsonNode;

/**
 * "You read this workbook like so — here is what you got wrong."
 *
 * <p>The same workbook as {@link SheetMappingRequest}, plus the reading the
 * model already produced and what the reviewer says about it. Revising the
 * SPEC rather than mapping again is the whole point: the spec is a few dozen
 * lines, the rows are re-expanded from the sheet deterministically, and the
 * decisions the reviewer has already made about qualities survive for every
 * path the revision leaves alone.
 *
 * <p>{@code instructions} is every correction the reviewer has given, oldest
 * first. All of them travel on every turn — cheap (they are one-liners) and it
 * stops a later correction from quietly undoing an earlier one.
 */
public record SheetRefineRequest(
        @NotEmpty(message = "the workbook has no sheets")
        List<SheetCsv> sheets,
        String fileName,
        @Size(max = 2000, message = "notes are at most 2000 characters")
        String notes,
        /** The spec from the reading being corrected, exactly as it was sent out. */
        JsonNode spec,
        @NotEmpty(message = "say what should change")
        List<@Size(max = 1000, message = "each correction is at most 1000 characters") String> instructions) {
}
