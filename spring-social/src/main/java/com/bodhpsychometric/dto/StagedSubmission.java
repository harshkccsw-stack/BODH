package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.dto.PortalSubmitRequest.AnswerEntry;
import com.bodhpsychometric.dto.PortalSubmitRequest.GameResultEntry;

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
 * <p>{@code gameResults} travel in the same envelope, validated the same way
 * and written by the same writer in the same transaction — a game's numbers
 * can never land without its answer, nor the answer without them. Null in an
 * envelope staged before games were saved, which writes no results.
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
        String lastError,
        List<GameResultEntry> gameResults) {

    public static StagedSubmission of(Long mappingId, Long respondentUserId, Long assessmentId,
            List<AnswerEntry> answers, int popUpCount, List<GameResultEntry> gameResults) {
        return new StagedSubmission(mappingId, respondentUserId, assessmentId, answers,
                popUpCount, System.currentTimeMillis(), 0, null, gameResults);
    }

    /** The same submission with one more failed digest attempt recorded. */
    public StagedSubmission withFailure(String error) {
        return new StagedSubmission(mappingId, respondentUserId, assessmentId, answers,
                popUpCount, submittedAtMillis, attempts + 1, error, gameResults);
    }

    /** Reset for a manual requeue — three fresh attempts. */
    public StagedSubmission requeued() {
        return new StagedSubmission(mappingId, respondentUserId, assessmentId, answers,
                popUpCount, submittedAtMillis, 0, lastError, gameResults);
    }
}
