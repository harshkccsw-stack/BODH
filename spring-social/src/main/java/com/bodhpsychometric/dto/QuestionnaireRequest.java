package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.auth.enums.Vertical;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Payload for creating/updating a questionnaire's catalog entry. Question
 * authoring is a separate flow; the legacy scoring/norm fields are
 * deliberately not exposed until they are reworked.
 */
public record QuestionnaireRequest(
        @NotBlank(message = "name is required")
        @Size(max = 200, message = "name must be at most 200 characters")
        String name,
        @Size(max = 50, message = "shortName must be at most 50 characters")
        String shortName,
        @Size(max = 100, message = "category must be at most 100 characters")
        String category,
        Vertical vertical,
        String description,
        Integer durationMinutes,
        String generalInstruction,
        Boolean hasSections) {
}
