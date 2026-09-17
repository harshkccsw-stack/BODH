package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

/**
 * A completed attempt arriving from MemoryMesh, for an assessment that was
 * imported from here: the person (find-or-create, the respondent mirror's
 * rules), which assessment of ours, and the answers.
 *
 * <p>Answers name the question by OUR id (MemoryMesh keeps that link) and the
 * option or grid row by POSITION — the index in our own sorted list — which is
 * exactly what the import copied over, so no option ids need to cross the
 * wire in either direction. An explicit id is accepted too.
 *
 * @param sourceMappingId MemoryMesh's attempt id, for tracing only
 * @param completedAt     ISO timestamp of the submission there, informational
 */
public record MemoryMeshAttemptSyncRequest(
        @NotNull(message = "The respondent is required") @Valid MemoryMeshRespondentSyncRequest respondent,
        @NotNull(message = "assessmentId is required") Long assessmentId,
        Long sourceMappingId,
        String completedAt,
        List<Answer> answers) {

    public record Answer(Long questionId, Long optionId, Integer optionPosition, Long questionRowId,
            Integer rowPosition, String answerText) {
    }
}
