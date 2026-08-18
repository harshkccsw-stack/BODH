package com.bodhpsychometric.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.bodhpsychometric.dto.PortalHeartbeat;
import com.bodhpsychometric.dto.PortalPartialAnswers;
import com.bodhpsychometric.dto.PortalQuestionnaireContent;
import com.bodhpsychometric.dto.StagedSubmission;

import tools.jackson.databind.ObjectMapper;

/**
 * The one place the application talks to Redis, and the one place that knows
 * Redis is OPTIONAL. Three stores share it:
 *
 * <ul>
 * <li><b>Content cache</b> — {@code bodh:content:q:{questionnaireId}}, the
 * questionnaire-shaped part of the portal payload (1-day TTL, evicted on
 * authoring writes). Keyed by questionnaire, NOT attempt: the per-attempt
 * option shuffle is applied after the cache, or two respondents would see
 * each other's order.</li>
 * <li><b>Partial answers</b> — {@code bodh:partial:{mappingId}}, the
 * respondent's marked answers snapshotted on section change (1-day TTL,
 * cleared by submit, abandon and practitioner reset).</li>
 * <li><b>Staged submissions</b> — {@code bodh:submit:{mappingId}} (7-day TTL)
 * plus two id sets, {@code bodh:submit:queue} (awaiting digest) and
 * {@code bodh:submit:failed} (3 digest attempts spent, held for a manual
 * requeue). The envelope is the durable copy of a submission until the
 * digest lands it in MySQL.</li>
 * </ul>
 *
 * <p>EVERY method here degrades instead of throwing: a Redis error is logged,
 * trips a short circuit breaker (so a dead Redis costs one timeout per
 * {@link #CIRCUIT_HOLD}, not one per request), and reads answer null / writes
 * answer false. Callers treat "Redis said no" as "use MySQL" — which is also
 * exactly what {@code app.redis.enabled: false} produces, with no connection
 * attempt at all (how the tests run).
 */
@Service
public class PortalRedisStore {

    private static final Logger log = LoggerFactory.getLogger(PortalRedisStore.class);

    private static final String CONTENT_PREFIX = "bodh:content:q:";
    private static final String PARTIAL_PREFIX = "bodh:partial:";
    private static final String SUBMISSION_PREFIX = "bodh:submit:";
    private static final String SUBMISSION_QUEUE = "bodh:submit:queue";
    private static final String SUBMISSION_FAILED = "bodh:submit:failed";
    private static final String LOCK_PREFIX = "bodh:submit:lock:";
    private static final String HEARTBEAT_PREFIX = "bodh:heartbeat:";

    /** Content cache TTL — the backstop behind explicit eviction on edits. */
    private static final Duration CONTENT_TTL = Duration.ofDays(1);
    /** Partial answers TTL — resume within a day, else start fresh. */
    private static final Duration PARTIAL_TTL = Duration.ofDays(1);
    /**
     * Staged submission TTL — the window the digest has to land the answers
     * in MySQL. A week, so even a long outage plus a weekend cannot silently
     * discard a respondent's submission. Rewrites (attempt bookkeeping)
     * re-arm the full TTL; the envelope is deleted the moment MySQL has the
     * rows, so a live key always means work left to do.
     */
    private static final Duration SUBMISSION_TTL = Duration.ofDays(7);
    /** Digest lock TTL — longer than any sane digest, short enough to self-heal. */
    private static final Duration LOCK_TTL = Duration.ofMinutes(2);
    /**
     * Heartbeat TTL — how long the tracking page remembers a silent
     * respondent's last position ("disconnected at Q14") before the row
     * falls back to the plain MySQL "in progress". Refreshed on every ping.
     */
    private static final Duration HEARTBEAT_TTL = Duration.ofMinutes(5);
    /** How long a Redis failure suspends further attempts. */
    private static final Duration CIRCUIT_HOLD = Duration.ofSeconds(30);

    private final StringRedisTemplate redis;
    private final ObjectMapper json;
    private final boolean enabled;

    /** Epoch millis before which Redis is not to be retried; 0 = closed. */
    private volatile long circuitOpenUntil;

    public PortalRedisStore(StringRedisTemplate redis, ObjectMapper json,
            @Value("${app.redis.enabled:true}") boolean enabled) {
        this.redis = redis;
        this.json = json;
        this.enabled = enabled;
    }

    /** Whether a call is worth attempting right now — off-switch + breaker. */
    public boolean available() {
        return enabled && System.currentTimeMillis() >= circuitOpenUntil;
    }

    // ── Content cache ───────────────────────────────────────────────────────

    public PortalQuestionnaireContent readContent(Long questionnaireId) {
        return read(CONTENT_PREFIX + questionnaireId, PortalQuestionnaireContent.class);
    }

    public void writeContent(Long questionnaireId, PortalQuestionnaireContent content) {
        write(CONTENT_PREFIX + questionnaireId, content, CONTENT_TTL);
    }

    public void evictContent(Long questionnaireId) {
        delete(CONTENT_PREFIX + questionnaireId);
    }

    // ── Partial answers ─────────────────────────────────────────────────────

    public PortalPartialAnswers readPartial(Long mappingId) {
        return read(PARTIAL_PREFIX + mappingId, PortalPartialAnswers.class);
    }

    /** True when the snapshot reached Redis — false is "skipped", not an error. */
    public boolean writePartial(Long mappingId, PortalPartialAnswers partial) {
        return write(PARTIAL_PREFIX + mappingId, partial, PARTIAL_TTL);
    }

    public void deletePartial(Long mappingId) {
        delete(PARTIAL_PREFIX + mappingId);
    }

    // ── Heartbeats (Live Tracking) ──────────────────────────────────────────

    /** Best-effort: a dropped ping is indistinguishable from a network blip. */
    public void writeHeartbeat(PortalHeartbeat heartbeat) {
        write(HEARTBEAT_PREFIX + heartbeat.mappingId(), heartbeat, HEARTBEAT_TTL);
    }

    public void deleteHeartbeat(Long mappingId) {
        delete(HEARTBEAT_PREFIX + mappingId);
    }

    /**
     * One MGET for the whole tracking page, not one GET per row — with a
     * broad filter this is the difference between 1 and 2000 round trips.
     * Missing keys and unparseable values are simply absent from the map.
     */
    public Map<Long, PortalHeartbeat> readHeartbeats(List<Long> mappingIds) {
        Map<Long, PortalHeartbeat> out = new LinkedHashMap<>();
        if (mappingIds.isEmpty() || !available()) {
            return out;
        }
        List<String> keys = new ArrayList<>(mappingIds.size());
        for (Long id : mappingIds) {
            keys.add(HEARTBEAT_PREFIX + id);
        }
        try {
            List<String> raws = redis.opsForValue().multiGet(keys);
            if (raws == null) {
                return out;
            }
            for (int i = 0; i < mappingIds.size() && i < raws.size(); i++) {
                String raw = raws.get(i);
                if (raw == null) {
                    continue;
                }
                try {
                    out.put(mappingIds.get(i), json.readValue(raw, PortalHeartbeat.class));
                } catch (RuntimeException ignored) {
                    // A corrupt beat reads as "no beat" — the row degrades to
                    // the plain MySQL state instead of failing the page.
                }
            }
            return out;
        } catch (RuntimeException e) {
            trip(e);
            return out;
        }
    }

    // ── Staged submissions ──────────────────────────────────────────────────

    /**
     * Stages a validated submission: envelope + queue membership, or false if
     * Redis would not take it (the caller then writes MySQL synchronously —
     * the pre-Redis path). The envelope write comes FIRST: a queue id without
     * an envelope is a no-op for the digest, an envelope without a queue id
     * is still found by a requeue, so this order fails safe both ways.
     */
    public boolean stageSubmission(StagedSubmission staged) {
        if (!write(SUBMISSION_PREFIX + staged.mappingId(), staged, SUBMISSION_TTL)) {
            return false;
        }
        return addToSet(SUBMISSION_QUEUE, staged.mappingId());
    }

    public StagedSubmission readSubmission(Long mappingId) {
        return read(SUBMISSION_PREFIX + mappingId, StagedSubmission.class);
    }

    /** Attempt bookkeeping between digest tries — re-arms the 7-day TTL. */
    public void rewriteSubmission(StagedSubmission staged) {
        write(SUBMISSION_PREFIX + staged.mappingId(), staged, SUBMISSION_TTL);
    }

    /** A live envelope means a submission not yet digested into MySQL. */
    public boolean hasPendingSubmission(Long mappingId) {
        if (!available()) {
            return false;
        }
        try {
            return Boolean.TRUE.equals(redis.hasKey(SUBMISSION_PREFIX + mappingId));
        } catch (RuntimeException e) {
            trip(e);
            return false;
        }
    }

    /** MySQL has the rows: drop the envelope and both set memberships. */
    public void completeSubmission(Long mappingId) {
        delete(SUBMISSION_PREFIX + mappingId);
        removeFromSet(SUBMISSION_QUEUE, mappingId);
        removeFromSet(SUBMISSION_FAILED, mappingId);
    }

    /** Third strike: out of the sweeper's queue, into the held-for-review set. */
    public void markSubmissionFailed(StagedSubmission staged) {
        rewriteSubmission(staged);
        removeFromSet(SUBMISSION_QUEUE, staged.mappingId());
        addToSet(SUBMISSION_FAILED, staged.mappingId());
    }

    /** Manual requeue: attempts reset by the caller, back under the sweeper. */
    public void requeueSubmission(StagedSubmission staged) {
        rewriteSubmission(staged);
        removeFromSet(SUBMISSION_FAILED, staged.mappingId());
        addToSet(SUBMISSION_QUEUE, staged.mappingId());
    }

    public Set<Long> queuedSubmissionIds() {
        return idSet(SUBMISSION_QUEUE);
    }

    public Set<Long> failedSubmissionIds() {
        return idSet(SUBMISSION_FAILED);
    }

    /**
     * Per-mapping digest lock, so the immediate post-submit attempt and the
     * sweeper cannot digest the same submission twice concurrently. SET NX
     * with a TTL rather than an in-process mutex, so it still holds if a
     * second app instance ever shares this Redis.
     */
    public boolean tryDigestLock(Long mappingId) {
        if (!available()) {
            return false;
        }
        try {
            return Boolean.TRUE.equals(
                    redis.opsForValue().setIfAbsent(LOCK_PREFIX + mappingId, "1", LOCK_TTL));
        } catch (RuntimeException e) {
            trip(e);
            return false;
        }
    }

    public void releaseDigestLock(Long mappingId) {
        delete(LOCK_PREFIX + mappingId);
    }

    // ── Plumbing ────────────────────────────────────────────────────────────

    private <T> T read(String key, Class<T> type) {
        if (!available()) {
            return null;
        }
        try {
            String raw = redis.opsForValue().get(key);
            return raw == null ? null : json.readValue(raw, type);
        } catch (RuntimeException e) {
            trip(e);
            return null;
        }
    }

    private boolean write(String key, Object value, Duration ttl) {
        if (!available()) {
            return false;
        }
        try {
            redis.opsForValue().set(key, json.writeValueAsString(value), ttl);
            return true;
        } catch (RuntimeException e) {
            trip(e);
            return false;
        }
    }

    private void delete(String key) {
        if (!available()) {
            return;
        }
        try {
            redis.delete(key);
        } catch (RuntimeException e) {
            trip(e);
        }
    }

    private boolean addToSet(String setKey, Long member) {
        if (!available()) {
            return false;
        }
        try {
            redis.opsForSet().add(setKey, String.valueOf(member));
            return true;
        } catch (RuntimeException e) {
            trip(e);
            return false;
        }
    }

    private void removeFromSet(String setKey, Long member) {
        if (!available()) {
            return;
        }
        try {
            redis.opsForSet().remove(setKey, String.valueOf(member));
        } catch (RuntimeException e) {
            trip(e);
        }
    }

    private Set<Long> idSet(String setKey) {
        Set<Long> ids = new LinkedHashSet<>();
        if (!available()) {
            return ids;
        }
        try {
            Set<String> members = redis.opsForSet().members(setKey);
            if (members != null) {
                for (String member : members) {
                    try {
                        ids.add(Long.valueOf(member));
                    } catch (NumberFormatException ignored) {
                        // A foreign value in our set is noise, not a failure.
                    }
                }
            }
            return ids;
        } catch (RuntimeException e) {
            trip(e);
            return ids;
        }
    }

    /**
     * One failure opens the breaker: every Redis path skips straight to its
     * MySQL fallback until {@link #CIRCUIT_HOLD} passes, instead of paying
     * the connection timeout on every request while Redis is down.
     */
    private void trip(RuntimeException e) {
        circuitOpenUntil = System.currentTimeMillis() + CIRCUIT_HOLD.toMillis();
        log.warn("Redis unavailable — degrading to MySQL for {}s ({})",
                CIRCUIT_HOLD.toSeconds(), e.getMessage());
    }
}
