package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.dto.PortalSubmitRequest.AnswerEntry;

/**
 * A VALIDATED final submission parked in Redis (7-day TTL) until the digest
 * lands it in MySQL. This is what lets submit answer 200 without waiting on a
 * MySQL write: once the envelope is stored, the submission is safe — the
 * mapping stays ONGOING with {@code isPersisted=false} until the digest flips
 * it, and {@code submissionPending} is what the portal shows meanwhile.
 *
 * <p>{@code answers} are already normalized by the submit validator — deduped
 * per (question, row, option), text trimmed — so the digest writes them
 * verbatim; the unique answer tuple in MySQL is the only re-check it needs.
 *
 * <p>{@code attempts}/{@code lastError} are digest bookkeeping: incremented
 * per failed try, and after {@code SubmissionDigestService.MAX_ATTEMPTS} the
 * envelope moves to the failed set and waits for a manual requeue. The record
 * is immutable — bookkeeping produces a copy via {@link #withFailure}.
 */
public record StagedSubmission(
        Long mappingId,
        Long respondentUserId,
        Long assessmentId,
        List<AnswerEntry> answers,
        int popUpCount,
        long submittedAtMillis,
        int attempts,
        String lastError) {

    public static StagedSubmission of(Long mappingId, Long respondentUserId, Long assessmentId,
            List<AnswerEntry> answers, int popUpCount) {
        return new StagedSubmission(mappingId, respondentUserId, assessmentId, answers,
                popUpCount, System.currentTimeMillis(), 0, null);
    }

    /** The same submission with one more failed digest attempt recorded. */
    public StagedSubmission withFailure(String error) {
        return new StagedSubmission(mappingId, respondentUserId, assessmentId, answers,
                popUpCount, submittedAtMillis, attempts + 1, error);
    }

    /** Reset for a manual requeue — three fresh attempts. */
    public StagedSubmission requeued() {
        return new StagedSubmission(mappingId, respondentUserId, assessmentId, answers,
                popUpCount, submittedAtMillis, 0, lastError);
    }
}
