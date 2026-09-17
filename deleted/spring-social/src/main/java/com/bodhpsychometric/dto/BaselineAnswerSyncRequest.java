package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/**
 * A respondent's completed baseline, arriving from MemoryMesh.
 *
 * <p>Carries the PERSON as well as the answers, in the same shape as the
 * respondent mirror, so the answers can land even if that earlier mirror
 * never did: the identity is found or created first, then the answers are
 * stored against it. Same rules as that mirror — a known email must match on
 * date of birth.
 *
 * @param answers one per question, by THIS side's question id, value 1..5
 */
public record BaselineAnswerSyncRequest(
        @NotNull(message = "The respondent is required")
        @Valid MemoryMeshRespondentSyncRequest respondent,
        List<Answer> answers) {

    public record Answer(Long baselineQuestionId, Integer value) {
    }
}
