package com.bodhpsychometric.dto;

/** @param stored how many answer rows now hold this attempt (replace-all) */
public record MemoryMeshAttemptSyncResponse(Long respondentUserId, Long respondentAssessmentMappingId, int stored) {
}
