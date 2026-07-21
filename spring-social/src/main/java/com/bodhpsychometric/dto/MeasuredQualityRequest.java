package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Payload for creating/updating a Measured Quality from the dashboard. */
public record MeasuredQualityRequest(
        @NotBlank(message = "name is required")
        @Size(max = 150, message = "name must be at most 150 characters")
        String name,
        String description) {
}
