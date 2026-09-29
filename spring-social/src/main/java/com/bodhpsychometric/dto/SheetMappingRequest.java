package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/**
 * A workbook, as the browser read it: one CSV per sheet, blank rows kept.
 *
 * <p>Blank rows are structure, not noise — the reference sheet's item table
 * ends at one, and the notes block below it is only recognisable by its
 * position. The browser converts with {@code blankrows: true} for that reason
 * and this side must not collapse them either.
 */
public record SheetMappingRequest(
        @NotEmpty(message = "the workbook has no sheets")
        List<SheetCsv> sheets,
        String fileName,
        /**
         * What the person uploading says about their own sheet — "the scale
         * is in the note under the table", "column D is the reverse flag".
         * Optional, and a hint rather than an instruction: the rules the
         * model is given still decide the shape of its answer.
         */
        @Size(max = 2000, message = "notes are at most 2000 characters")
        String notes) {

    public record SheetCsv(
            @NotBlank(message = "each sheet needs a name")
            String name,
            String csv) {
    }
}
