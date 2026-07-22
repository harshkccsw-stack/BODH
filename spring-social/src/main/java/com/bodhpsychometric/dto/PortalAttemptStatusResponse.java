package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;

/** What begin/submit hand back: the attempt and where it now stands. */
public record PortalAttemptStatusResponse(
        Long respondentAssessmentMappingId,
        RespondentAssessmentStatus assessmentStatus) {

    public static PortalAttemptStatusResponse from(RespondentAssessmentMapping mapping) {
        return new PortalAttemptStatusResponse(
                mapping.getRespondentAssessmentMappingId(),
                mapping.getAssessmentStatus());
    }
}
