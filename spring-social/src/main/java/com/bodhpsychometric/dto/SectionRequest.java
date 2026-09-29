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
        String instruction,
        // Repeat the instruction above every question of the section instead
        // of only its first. Boxed and nullable on purpose: a client written
        // before this field existed omits it, and that must mean "off" rather
        // than a 400.
        Boolean showInstructionOnEachQuestion) {

    /** The flag as the entity wants it — absent means off. */
    public boolean repeatsInstruction() {
        return Boolean.TRUE.equals(showInstructionOnEachQuestion);
    }
}
