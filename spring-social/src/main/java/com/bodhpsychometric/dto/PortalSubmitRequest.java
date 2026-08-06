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

    public record AnswerEntry(Long questionId, Long optionId) {
    }
}
