package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Create/update payload for a role. urlPaths is the whole set every time —
 * update REPLACES it rather than merging, so unticking a page in the editor
 * actually removes it.
 *
 * The element pattern accepts a rooted path whose LAST segment may be a lone
 * star — /dashboard, /admin/[star], /assessments/edit/:id, /[star] — and
 * rejects a star anywhere else (mid-word, or in a middle segment), because
 * the frontend matcher only understands a trailing wildcard. A pattern it can
 * never match would look granted in the editor and deny in practice.
 */
public record RoleRequest(
        @NotBlank(message = "Role name is required")
        @Size(max = 50, message = "Role name must be at most 50 characters") String name,

        String description,

        @NotEmpty(message = "Select at least one page for this role")
        List<@NotBlank(message = "URL path must not be blank")
             @Size(max = 255, message = "URL path must be at most 255 characters")
             @Pattern(regexp = "^/(?:[A-Za-z0-9._:-]+/)*(?:[A-Za-z0-9._:-]+|\\*)?$",
                     message = "URL path must start with / and may only end in a * wildcard")
             String> urlPaths) {
}
