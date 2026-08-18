package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;

/**
 * What begin/abandon/submit hand back: where the allotment now stands, plus
 * the durability fact check — isPersisted turns true once the answers are
 * committed to MySQL.
 *
 * <p>{@code submissionPending} is the Redis-first submit's third state: the
 * submission is safely staged (the 200 the respondent saw was honest) but the
 * digest has not landed it in MySQL yet, so assessmentStatus still reads
 * ONGOING and isPersisted false. The portal shows "being processed" off this
 * flag rather than inferring anything from the other two.
 */
public record PortalAttemptStatusResponse(
        Long respondentAssessmentMappingId,
        RespondentAssessmentStatus assessmentStatus,
        boolean isPersisted,
        boolean submissionPending) {

    public static PortalAttemptStatusResponse from(RespondentAssessmentMapping mapping) {
        return from(mapping, false);
    }

    public static PortalAttemptStatusResponse from(RespondentAssessmentMapping mapping,
            boolean submissionPending) {
        return new PortalAttemptStatusResponse(
                mapping.getRespondentAssessmentMappingId(),
                mapping.getAssessmentStatus(),
                mapping.isPersisted(),
                submissionPending);
    }
}
