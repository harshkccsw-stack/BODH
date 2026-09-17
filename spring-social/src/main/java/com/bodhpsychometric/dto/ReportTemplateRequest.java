package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create or update a report template. The tag list is NOT accepted from the
 * client — it is parsed from {@link #html()} on every save, because the HTML
 * is the single source of truth about which tags exist and a client-supplied
 * list could disagree with it.
 *
 * @param html the authored template. Capped at 4 MB: a report carrying an
 *        inline base64 logo and several SVG charts is comfortably under that,
 *        and the column is LONGTEXT, so the cap is about refusing a paste
 *        accident rather than about storage.
 */
public record ReportTemplateRequest(

        @NotBlank(message = "Give the template a name")
        @Size(max = 160, message = "Name must be 160 characters or fewer")
        String name,

        @Size(max = 512, message = "Description must be 512 characters or fewer")
        String description,

        @NotBlank(message = "A template needs some HTML")
        @Size(max = 4_000_000, message = "Template HTML is too large (4 MB maximum)")
        String html,

        Long organizationId) {
}
