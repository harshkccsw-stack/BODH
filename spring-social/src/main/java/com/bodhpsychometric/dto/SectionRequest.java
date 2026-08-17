package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Payload for creating a section inside a questionnaire. */
public record SectionRequest(
        @NotBlank(message = "name is required")
        @Size(max = 200, message = "name must be at most 200 characters")
        String name,
        // Shown above this section's questions, same markup subset as
        // generalInstruction (see RichTextHtml). Shorter cap because this one
        // is a line or two in front of a question, not a briefing page.
        @Size(max = 5_000, message = "instruction must be at most 5000 characters")
        String instruction) {
}
