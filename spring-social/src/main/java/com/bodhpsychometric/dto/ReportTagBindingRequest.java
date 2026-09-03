package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Answer one tag: "what fills this?".
 *
 * <p>The tag itself is not here — it comes from the path, because a binding
 * row exists only because the parser found that tag in the HTML. Renaming a
 * binding's tag is not an operation; editing the HTML is.
 *
 * <p>Which fields are required depends on {@link #binderType()}, so the
 * checking is in the service rather than in annotations: {@code CORE} needs a
 * known {@code coreField}, {@code LITERAL} needs {@code literalText}, and
 * {@code UNBOUND} needs neither. Bean validation cannot express that without
 * a class-level constraint whose message would be less useful than the four
 * specific ones the service produces.
 */
public record ReportTagBindingRequest(

        @NotBlank(message = "Choose what fills this tag")
        @Size(max = 16)
        String binderType,

        @Size(max = 40)
        String coreField,

        @Size(max = 20_000, message = "Literal text must be 20000 characters or fewer")
        String literalText,

        @Size(max = 40, message = "Format must be 40 characters or fewer")
        String format,

        @Size(max = 255, message = "Fallback text must be 255 characters or fewer")
        String fallbackText,

        @Size(max = 4000, message = "Note must be 4000 characters or fewer")
        String authorNote) {
}
