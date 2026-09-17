package com.bodhpsychometric.dto;

/**
 * One attempt in a computation's cohort, as the preview picker lists it.
 *
 * <p>{@code recipient} says whether a batch would produce a PDF for this
 * person: COMPLETED, and inside the respondent scope when that is SELECTED.
 * The others are listed too, greyed, so the author can see who the cohort
 * statistics include that the batch will not write up.
 */
public record ReportRecipientResponse(
        Long attemptId,
        Long respondentUserId,
        String name,
        String serialId,
        String status,
        boolean recipient) {
}
