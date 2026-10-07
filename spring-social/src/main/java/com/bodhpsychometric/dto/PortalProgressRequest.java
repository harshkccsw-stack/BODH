package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.dto.PortalSubmitRequest.AnswerEntry;
import com.bodhpsychometric.dto.PortalSubmitRequest.GameResultEntry;

/**
 * Payload for the partial-answer save: the FULL set of answers marked so far
 * (not a delta), in the submit entry shape. Sent by the portal on section
 * change — and every few questions on a sectionless paper — while the
 * assessment's savePartialAnswers toggle is on.
 *
 * {@code gameResults} are the finished games' numbers so far, kept with the
 * snapshot so a resumed attempt does not show a game as finished while its
 * numbers are gone. Unvalidated like the answers; submit validates both.
 */
public record PortalProgressRequest(List<AnswerEntry> answers, List<GameResultEntry> gameResults) {
}
