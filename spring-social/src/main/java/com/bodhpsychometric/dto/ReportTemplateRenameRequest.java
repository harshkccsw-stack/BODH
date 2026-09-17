package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A new name for a template and every version of it.
 *
 * <p>Its own request rather than a field on {@link ReportTemplateRequest}
 * because renaming is allowed on a PUBLISHED template and editing is not — a
 * name is a label, the content is the record.
 */
public record ReportTemplateRenameRequest(

        @NotBlank(message = "Give the template a name")
        @Size(max = 160, message = "Name must be 160 characters or fewer")
        String name) {
}
