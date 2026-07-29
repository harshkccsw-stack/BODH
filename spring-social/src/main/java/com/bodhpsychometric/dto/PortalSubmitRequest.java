package com.bodhpsychometric.dto;

import java.util.List;

/**
 * Payload for the once-and-for-all answer submission: one entry per question,
 * every placed question answered. Elements are validated in pass 1 before
 * anything is written (bulk convention — @Valid cannot reach list elements).
 */
public record PortalSubmitRequest(List<AnswerEntry> answers) {

    public record AnswerEntry(Long questionId, Long optionId) {
    }
}
