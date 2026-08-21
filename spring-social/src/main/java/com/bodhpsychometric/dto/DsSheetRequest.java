package com.bodhpsychometric.dto;

import java.util.Map;

import jakarta.validation.constraints.Size;

/**
 * Create/update payload for a sheet. Used by both, which is why nothing is
 * {@code @NotBlank}: create validates that a name and an assessment binding
 * are present in the service, and update treats every null field as "leave
 * this alone" so the grid can save display state without resending the rest.
 *
 * <p>{@code sourceFilters} is the binding — {@code {"assessmentId": 12}},
 * optionally with {@code "organizationId"} to narrow to one org's members.
 */
public record DsSheetRequest(
        @Size(max = 160, message = "Name must be at most 160 characters") String name,
        String sourceView,
        Map<String, Object> sourceFilters,
        String grain,
        Map<String, Object> displayState,
        Integer sortOrder) {
}
