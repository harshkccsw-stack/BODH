package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.dto.PortalSubmitRequest.AnswerEntry;

/**
 * Payload for the partial-answer save: the FULL set of answers marked so far
 * (not a delta), in the submit entry shape. Sent by the portal on section
 * change — and every few questions on a sectionless paper — while the
 * assessment's savePartialAnswers toggle is on.
 */
public record PortalProgressRequest(List<AnswerEntry> answers) {
}
