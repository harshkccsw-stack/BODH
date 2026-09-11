package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A new name for a computation.
 *
 * <p>Its own request rather than a field on {@link ReportComputationRequest}
 * because renaming is allowed on an APPROVED computation and editing is not.
 * Approval freezes what the computation PRODUCES; the name is a label.
 */
public record ReportComputationRenameRequest(

        @NotBlank(message = "Give the computation a name")
        @Size(max = 160, message = "Name must be 160 characters or fewer")
        String name) {
}
