package com.bodhpsychometric.model.assessment;

/**
 * Respondent-facing behavior of an assessment:
 * ACTIVE — allottable and takeable; CLOSED — no new allotments, in-progress
 * attempts may finish; PAUSED — takers are blocked; TEST — trial mode (kept
 * from the old system by product decision).
 */
public enum AssessmentStatus {
    ACTIVE,
    CLOSED,
    PAUSED,
    TEST
}
