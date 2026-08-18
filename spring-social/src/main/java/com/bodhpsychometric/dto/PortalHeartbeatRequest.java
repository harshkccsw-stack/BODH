package com.bodhpsychometric.dto;

/**
 * The portal's live-position ping. All fields nullable (clamped to 0 server
 * side) so an older client can never turn a heartbeat into a 400 — a
 * heartbeat that says nothing is still a heartbeat, and "they are here" is
 * the load-bearing bit.
 */
public record PortalHeartbeatRequest(
        Integer currentQuestion,
        Integer answeredCount,
        Integer totalQuestions) {
}
