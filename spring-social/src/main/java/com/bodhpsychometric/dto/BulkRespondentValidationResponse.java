package com.bodhpsychometric.dto;

import java.util.List;

/**
 * The result of checking an uploaded sheet WITHOUT writing anything — every
 * problem in it, not just the first.
 *
 * That is the point of having a validate step at all. Failing on the first bad
 * row (the shape /api/questions/bulk-create uses) is fine for ten questions
 * and miserable for three hundred people: fix row 7, re-upload, discover row
 * 12, repeat. Here the admin fixes the sheet once.
 *
 * The same report shape comes back from bulk-create when it refuses, so the
 * page has one thing to render either way.
 */
public record BulkRespondentValidationResponse(
        int totalRows,
        int validRows,
        List<Issue> issues) {

    /**
     * One problem with one row. `row` is the admin's own spreadsheet line
     * number, echoed straight back from the request.
     */
    public record Issue(int row, String field, String message) {
    }
}
