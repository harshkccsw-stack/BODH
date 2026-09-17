package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotNull;

/** Find or create the one computation for an assessment and a template. */
public record ReportComputationForTemplateRequest(
        @NotNull(message = "Choose the assessment") Long assessmentId,
        @NotNull(message = "Choose the template") Long reportTemplateId,
        Long organizationId) {
}
