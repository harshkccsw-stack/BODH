package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A scoring-logic workbook, as CSV text.
 *
 * <p>CSV and not a file upload because the browser converts: a .xlsx is turned
 * into this text by the SheetJS build the dashboard already bundles, so an
 * .xlsx and a .csv arrive here identically and the backend gained no
 * spreadsheet dependency to read three columns.
 */
public record ScoringSheetImportRequest(

        @NotBlank(message = "Choose a file to import")
        @Size(max = 2_000_000, message = "That file is too large to import")
        String csv,

        /**
         * Which assessment the imported rules belong to. Rules arrive as
         * STATEMENTs and so are not validated against columns yet, but the
         * assessment is what files them somewhere a practitioner can find.
         */
        Long assessmentId,

        Long organizationId) {
}
