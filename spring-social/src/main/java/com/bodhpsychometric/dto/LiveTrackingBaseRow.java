package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;

/**
 * The MySQL half of one Live Tracking row — a flat constructor projection
 * (see RespondentAssessmentMappingRepository.findForLiveTracking), never an
 * entity graph: the tracking poll re-reads this list every few seconds, so it
 * has to be one cheap query with nothing lazy behind it. Cached in-process
 * for a few seconds per filter; the Redis overlay (heartbeat, pending
 * submission) is applied per request on top.
 *
 * <p>{@code respondentUserId} is the USER id (what the JWT carries), kept so
 * the read side can discard heartbeats written under someone else's token —
 * the ownership check the DB-free heartbeat write deliberately skips.
 */
public record LiveTrackingBaseRow(
        Long mappingId,
        RespondentAssessmentStatus status,
        Long respondentUserId,
        String respondentName,
        String respondentEmail,
        String serialId,
        Long organizationId,
        String organizationName,
        Long assessmentId,
        String assessmentName,
        Long questionnaireId) {
}
