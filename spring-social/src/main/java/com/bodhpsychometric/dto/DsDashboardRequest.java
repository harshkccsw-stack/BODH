package com.bodhpsychometric.dto;

import java.util.Map;

import jakarta.validation.constraints.Size;

/**
 * Create/update payload for a dashboard. Like the sheet request this serves
 * both, so a null field on update means "unchanged" — the layout can be saved
 * on its own after a drag without resending the name.
 */
public record DsDashboardRequest(
        @Size(max = 160, message = "Name must be at most 160 characters") String name,
        Map<String, Object> layout,
        Integer sortOrder) {
}
