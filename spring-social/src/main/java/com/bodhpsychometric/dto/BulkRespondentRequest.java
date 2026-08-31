package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

/**
 * An uploaded sheet of respondents, all destined for ONE organization.
 *
 * The organization is a top-level field and never a column: a spreadsheet must
 * not be able to smuggle people into an organization the admin was not looking
 * at when they uploaded it.
 *
 * Every row field is a raw String, deliberately, and carries no bean-validation
 * constraints. Both are the same decision: this payload's whole purpose is to
 * be checked row by row and to report EVERY problem at once. If `dob` were a
 * LocalDate, one unparseable cell would fail Jackson before the controller ran
 * and answer 400 for the entire upload with no row number — which is exactly
 * the experience the validate step exists to avoid. Parsing and validating by
 * hand keeps "row 37: date of birth must be dd-MM-yyyy" possible.
 */
public record BulkRespondentRequest(
        @NotNull(message = "organizationId is required") Long organizationId,
        @NotEmpty(message = "The sheet has no rows") List<Row> rows) {

    /**
     * One sheet row. `row` is the 1-based line number as the ADMIN sees it in
     * their spreadsheet, sent by the client and echoed back on every issue so
     * a report points at something they can actually find and fix.
     */
    public record Row(
            int row,
            String name,
            String email,
            /**
             * dd-MM-yyyy, matching RespondentRequest and the wizard's own
             * form. Bounded to 1900-01-01 .. today per row since 2026-08-31.
             */
            String dob,
            /**
             * Dial code with the '+', e.g. "+91". Its own column since
             * 2026-08-31, which means a sheet written before that date no
             * longer uploads: the page names the missing column rather than
             * letting the server answer with one "required" issue per line.
             */
            String phoneCountryCode,
            /**
             * Required — checked per row, so a blank names its line number.
             * Exactly ten digits since 2026-08-31; a spreadsheet that ate the
             * leading zero of a shorter number is the case the "add leading
             * zeros" wording in the issue is there to explain.
             */
            String phone,
            String employeeId,
            /**
             * Required. MALE / FEMALE / OTHER / PREFER_NOT_TO_SAY,
             * case-insensitive, and spaces or hyphens fold to underscores so
             * "Prefer not to say" typed into a cell resolves.
             */
            String gender) {
    }
}
