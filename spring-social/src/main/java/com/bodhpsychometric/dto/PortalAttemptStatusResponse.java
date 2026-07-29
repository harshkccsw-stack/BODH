package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;

/**
 * What begin/submit hand back: where the allotment now stands, plus the
 * durability fact check — isPersisted turns true once the answers are
 * committed to MySQL, which is what the portal trusts when a Redis-backed
 * submit lands in front of this later.
 */
public record PortalAttemptStatusResponse(
        Long respondentAssessmentMappingId,
        RespondentAssessmentStatus assessmentStatus,
        boolean isPersisted) {

    public static PortalAttemptStatusResponse from(RespondentAssessmentMapping mapping) {
        return new PortalAttemptStatusResponse(
                mapping.getRespondentAssessmentMappingId(),
                mapping.getAssessmentStatus(),
                mapping.isPersisted());
    }
}
