package com.bodhpsychometric.dto;

import java.util.List;

/**
 * Payload for the once-and-for-all answer submission: one entry per question,
 * every placed question answered. Elements are validated in pass 1 before
 * anything is written (bulk convention — @Valid cannot reach list elements).
 *
 * {@code popUpCount} is the attempt-level tally of inactivity "focus" popups
 * dismissed in the portal — nullable/optional (treated as 0 when absent), so
 * older clients that never send it keep working.
 */
public record PortalSubmitRequest(List<AnswerEntry> answers, Integer popUpCount) {

    /**
     * {@code questionRowId} is which grid ROW this rating answers. Nullable,
     * and null for every question type but LIKERT_GRID — so a client written
     * before grids existed keeps sending exactly what it always sent. The
     * submit validator refuses the two ways round it can be wrong: a grid
     * answer without a row, and a row on a question that has none.
     *
     * {@code answerText} is the SHORT_ANSWER payload and the mirror image:
     * required on that type, where optionId is null, and refused on every
     * other, where an option is what an answer is. One entry per question —
     * a second is a 400 rather than a silent overwrite.
     */
    public record AnswerEntry(Long questionId, Long optionId, Long questionRowId, String answerText) {
    }
}
