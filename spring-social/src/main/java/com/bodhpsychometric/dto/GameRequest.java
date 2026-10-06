package com.bodhpsychometric.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Payload for creating/updating a catalog game. {@code code} is the portal
 * registry key and is stored upper case; letters, digits and underscores only,
 * so it can never be mistaken for anything else in a URL or a log line.
 * {@code active} omitted means true and {@code version} omitted means 1 on
 * create — and "unchanged" on update.
 */
public record GameRequest(
        @NotBlank(message = "code is required")
        @Size(max = 50, message = "code is at most 50 characters")
        @Pattern(regexp = "^\\s*[A-Za-z0-9_]+\\s*$",
                message = "code may contain only letters, digits and underscores")
        String code,
        @NotBlank(message = "name is required")
        @Size(max = 150, message = "name is at most 150 characters")
        String name,
        String description,
        Boolean active,
        @Min(value = 1, message = "version starts at 1")
        Integer version) {
}
