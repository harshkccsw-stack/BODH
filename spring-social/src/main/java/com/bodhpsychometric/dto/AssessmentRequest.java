package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload for creating/updating an assessment. questionnaireId maps the
 * assessment to exactly one catalog questionnaire; nullable config fields
 * fall back to the entity defaults (T&C on, INACTIVE, autoNext off).
 */
public record AssessmentRequest(
        @NotBlank(message = "name is required")
        @Size(max = 200, message = "name must be at most 200 characters")
        String name,
        @NotNull(message = "questionnaireId is required")
        Long questionnaireId,
        Boolean showTermsAndConditions,
        AssessmentStatus status,
        Boolean autoNext) {
}
