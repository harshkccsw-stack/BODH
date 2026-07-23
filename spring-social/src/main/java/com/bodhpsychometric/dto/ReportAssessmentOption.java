package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;

/** One row of the report page's assessment dropdown. */
public record ReportAssessmentOption(Long assessmentId, String name, AssessmentStatus status) {

    public static ReportAssessmentOption from(Assessment assessment) {
        return new ReportAssessmentOption(assessment.getAssessmentId(), assessment.getName(),
                assessment.getStatus());
    }
}
