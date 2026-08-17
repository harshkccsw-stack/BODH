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
        // Shown to respondents before the first question, as the editor's HTML
        // subset — or as plain prose, for everything authored before the editor
        // existed. The allowed markup is enforced in the controller (see
        // RichTextHtml); a blank body is stored as null.
        @Size(max = 20_000, message = "generalInstruction must be at most 20000 characters")
        String generalInstruction,
        Boolean hasSections) {
}
