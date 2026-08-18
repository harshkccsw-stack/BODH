package com.bodhpsychometric.dto;

/**
 * What the partial-answer save hands back. {@code saved=false} is NOT an
 * error — it means Redis was unavailable and the snapshot was skipped, which
 * the portal treats as a non-event (the next section change tries again, and
 * the worst case is a resume without backfill).
 */
public record PortalProgressResponse(boolean saved, int answerCount) {
}
