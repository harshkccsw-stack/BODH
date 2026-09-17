package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotNull;

/** Copy a library rule, and everything it reads, onto one assessment. */
public record ReportRuleForkRequest(
        @NotNull(message = "Choose the assessment to copy this rule onto")
        Long assessmentId,
        Long organizationId) {
}
