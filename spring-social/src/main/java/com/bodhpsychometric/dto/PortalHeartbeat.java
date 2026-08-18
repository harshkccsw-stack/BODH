package com.bodhpsychometric.dto;

/**
 * One respondent's live position as Redis stores it (5-minute TTL, key
 * bodh:heartbeat:{mappingId}) — the only signal behind the Live Tracking
 * page. Written by the DB-free heartbeat endpoint every ~10s and on every
 * question change; read in one batched MGET per tracking request; deleted on
 * submit/abandon/reset.
 *
 * <p>{@code userId} is whoever the bearer token said was pinging. The write
 * path deliberately never checks ownership against MySQL (that would put a
 * query under every ping) — the TRACKING READ drops any heartbeat whose
 * userId is not the mapping's own respondent, which is where the check is
 * paid once per page instead of once per ping.
 *
 * <p>Staleness of {@code lastSeenMillis} is the whole state machine: fresh =
 * live, briefly stale = no signal, long stale = disconnected, key expired =
 * the plain MySQL "in progress" with no position memory.
 */
public record PortalHeartbeat(
        Long mappingId,
        Long userId,
        int currentQuestion,
        int answeredCount,
        int totalQuestions,
        long lastSeenMillis) {
}
