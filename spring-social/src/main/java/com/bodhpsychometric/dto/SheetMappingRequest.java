package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

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
        String fileName) {

    public record SheetCsv(
            @NotBlank(message = "each sheet needs a name")
            String name,
            String csv) {
    }
}
