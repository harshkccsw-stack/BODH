package com.bodhpsychometric.dto;

import java.math.BigDecimal;

import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload for creating/updating an assessment. questionnaireId maps the
 * assessment to exactly one catalog questionnaire; nullable config fields
 * fall back to the entity defaults (T&C on, INACTIVE, autoNext off).
 * price/currency drive the public catalog and are optional — an unpriced
 * assessment lists as "Price on request".
 */
public record AssessmentRequest(
        @NotBlank(message = "name is required")
        @Size(max = 200, message = "name must be at most 200 characters")
        String name,
        @NotNull(message = "questionnaireId is required")
        Long questionnaireId,
        Boolean showTermsAndConditions,
        AssessmentStatus status,
        Boolean autoNext,
        @DecimalMin(value = "0.0", message = "price must not be negative")
        @Digits(integer = 8, fraction = 2, message = "price must have at most 8 digits and 2 decimals")
        BigDecimal price,
        @Size(max = 3, message = "currency must be a 3-letter code")
        String currency) {
}
