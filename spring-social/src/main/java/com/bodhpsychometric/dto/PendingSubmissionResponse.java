package com.bodhpsychometric.dto;

/**
 * One Redis-staged submission the digest has not landed in MySQL yet, for the
 * dashboard's operational view. {@code failed=true} means all digest attempts
 * are spent and the envelope is held for a manual requeue — until then it
 * still counts down its 7-day TTL.
 */
public record PendingSubmissionResponse(
        Long respondentAssessmentMappingId,
        int attempts,
        String lastError,
        long submittedAtMillis,
        boolean failed) {

    public static PendingSubmissionResponse from(StagedSubmission staged, boolean failed) {
        return new PendingSubmissionResponse(staged.mappingId(), staged.attempts(),
                staged.lastError(), staged.submittedAtMillis(), failed);
    }
}
