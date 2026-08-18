package com.bodhpsychometric.dto;

/**
 * One poll of the Live Tracking page: whole-filter totals per state, plus one
 * page of rows already sorted most-alive-first. The page is sliced server
 * side from the full (cached) list because the ordering depends on Redis
 * state SQL cannot see.
 */
public record LiveTrackingResponse(Summary summary, ReportPageResponse<Row> page) {

    /**
     * Where one allotment stands right now. DECLARATION ORDER IS THE SORT
     * ORDER — rows are ranked by ordinal, so the states needing attention
     * surface on page one.
     *
     * <ul>
     * <li>{@code LIVE} — heartbeat within the live window; the respondent is
     * actively on the questions screen.</li>
     * <li>{@code NO_SIGNAL} — pings stopped seconds ago: hidden tab, network
     * blip, or a just-closed browser. Position is the last known one.</li>
     * <li>{@code DISCONNECTED} — silent for over a minute; last position
     * still shown while the heartbeat key lives (5 minutes).</li>
     * <li>{@code OFFLINE} — ONGOING in MySQL with no heartbeat memory at all
     * (never pinged on this attempt, or silent past the key TTL).</li>
     * <li>{@code PROCESSING} — submitted; the full answer set is staged in
     * Redis and the digest has not landed it in MySQL yet.</li>
     * <li>{@code COMPLETED} — answers durably in MySQL.</li>
     * <li>{@code NOT_STARTED} — allotted, never begun (or abandoned back).</li>
     * </ul>
     */
    public enum State {
        LIVE, NO_SIGNAL, DISCONNECTED, OFFLINE, PROCESSING, COMPLETED, NOT_STARTED
    }

    /**
     * {@code currentQuestion}/{@code answeredCount}/{@code lastSeenMillis}
     * come from the heartbeat and are null when there is none. PROCESSING
     * and COMPLETED rows get {@code answeredCount == totalQuestions} (submit
     * validates completeness), so the client renders a full bar without
     * special-casing.
     */
    public record Row(
            Long respondentAssessmentMappingId,
            String respondentName,
            String respondentEmail,
            String serialId,
            Long organizationId,
            String organizationName,
            Long assessmentId,
            String assessmentName,
            State state,
            Integer currentQuestion,
            Integer answeredCount,
            long totalQuestions,
            Long lastSeenMillis) {
    }

    /** Whole-filter counts — the stat cards, independent of the page slice. */
    public record Summary(
            long live,
            long noSignal,
            long disconnected,
            long offline,
            long processing,
            long completed,
            long notStarted,
            long total) {
    }
}
