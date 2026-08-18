package com.bodhpsychometric.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.PendingSubmissionResponse;
import com.bodhpsychometric.dto.StagedSubmission;

/**
 * Drains Redis-staged submissions into MySQL — the back half of the
 * Redis-first submit. The respondent's 200 was earned by the envelope
 * reaching Redis; everything here happens after and off their request thread:
 *
 * <ol>
 * <li>An immediate {@link #digestAsync} attempt fired right after the 200, so
 * the happy path lands in MySQL within moments.</li>
 * <li>A sweeper every minute retrying whatever is still queued — the MySQL
 * outage / write-bottleneck case the staging exists for.</li>
 * <li>After {@value #MAX_ATTEMPTS} failed attempts the envelope moves to the
 * failed set: out of the sweeper's way, visible via the reports pending
 * listing, revivable with a manual requeue. It keeps its 7-day TTL.</li>
 * </ol>
 *
 * <p>A per-mapping Redis lock keeps the immediate attempt and the sweeper
 * from digesting the same submission concurrently; the writer's
 * COMPLETED+persisted guard makes a duplicate digest a no-op anyway.
 */
@Service
public class SubmissionDigestService {

    private static final Logger log = LoggerFactory.getLogger(SubmissionDigestService.class);

    /** Automatic digest tries per submission before it is held for review. */
    public static final int MAX_ATTEMPTS = 3;

    private final PortalRedisStore redis;
    private final AssessmentSubmissionWriter writer;

    public SubmissionDigestService(PortalRedisStore redis, AssessmentSubmissionWriter writer) {
        this.redis = redis;
        this.writer = writer;
    }

    /** The post-submit attempt — fire-and-forget on the async executor. */
    @Async
    public void digestAsync(Long mappingId) {
        digest(mappingId);
    }

    /**
     * The safety net behind the immediate attempt. fixedDelay, not fixedRate:
     * a slow MySQL is exactly when this runs long, and overlapping sweeps
     * would only pile more load onto it. No-ops instantly while Redis is
     * disabled or its circuit breaker is open.
     */
    @Scheduled(fixedDelay = 60_000, initialDelay = 15_000)
    public void sweep() {
        if (!redis.available()) {
            return;
        }
        for (Long mappingId : redis.queuedSubmissionIds()) {
            digest(mappingId);
        }
    }

    private void digest(Long mappingId) {
        if (!redis.tryDigestLock(mappingId)) {
            return;
        }
        try {
            StagedSubmission staged = redis.readSubmission(mappingId);
            if (staged == null) {
                // Envelope gone (digested elsewhere, or TTL expired) — clear
                // any leftover set membership so the sweeper stops visiting.
                redis.completeSubmission(mappingId);
                return;
            }
            try {
                writer.persist(mappingId, staged.answers(), staged.popUpCount());
                redis.completeSubmission(mappingId);
                log.info("Digested staged submission for attempt {} into MySQL", mappingId);
            } catch (ResponseStatusException e) {
                if (e.getStatusCode() == HttpStatus.NOT_FOUND) {
                    // The allotment was deleted after staging. No row to ever
                    // write — retrying cannot fix it, so drop the envelope.
                    redis.completeSubmission(mappingId);
                    log.warn("Dropping staged submission for attempt {} — mapping no longer exists", mappingId);
                } else {
                    recordFailure(staged, e);
                }
            } catch (RuntimeException e) {
                recordFailure(staged, e);
            }
        } finally {
            redis.releaseDigestLock(mappingId);
        }
    }

    private void recordFailure(StagedSubmission staged, Exception e) {
        StagedSubmission next = staged.withFailure(e.getMessage());
        if (next.attempts() >= MAX_ATTEMPTS) {
            redis.markSubmissionFailed(next);
            log.error("Submission for attempt {} failed all {} digest attempts — held for manual requeue: {}",
                    next.mappingId(), MAX_ATTEMPTS, e.getMessage());
        } else {
            redis.rewriteSubmission(next);
            log.warn("Digest attempt {}/{} for attempt {} failed: {}",
                    next.attempts(), MAX_ATTEMPTS, next.mappingId(), e.getMessage());
        }
    }

    /**
     * Everything staged and not yet in MySQL, queued and failed alike — the
     * reports view of "submissions the respondent has that MySQL does not".
     */
    public List<PendingSubmissionResponse> pendingSubmissions() {
        List<PendingSubmissionResponse> out = new ArrayList<>();
        for (Long id : redis.queuedSubmissionIds()) {
            StagedSubmission staged = redis.readSubmission(id);
            if (staged != null) {
                out.add(PendingSubmissionResponse.from(staged, false));
            }
        }
        for (Long id : redis.failedSubmissionIds()) {
            StagedSubmission staged = redis.readSubmission(id);
            if (staged != null) {
                out.add(PendingSubmissionResponse.from(staged, true));
            }
        }
        return out;
    }

    /**
     * Puts a held (or stuck) envelope back under the sweeper with fresh
     * attempts and fires a digest right away. Empty when nothing is staged
     * for that attempt — already digested, expired, or never existed.
     */
    public Optional<PendingSubmissionResponse> requeue(Long mappingId) {
        StagedSubmission staged = redis.readSubmission(mappingId);
        if (staged == null) {
            return Optional.empty();
        }
        StagedSubmission reset = staged.requeued();
        redis.requeueSubmission(reset);
        digestAsync(mappingId);
        return Optional.of(PendingSubmissionResponse.from(reset, false));
    }
}
