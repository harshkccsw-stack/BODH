package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

/**
 * Taxonomy paths to resolve against what exists, with no model involved.
 *
 * <p>Used when the review panel rewrites a path — re-anchoring one the sheet
 * rooted too shallowly — and needs the §5.1 rule run again on the new key. The
 * rule lives in one place on the server, so the browser asks rather than
 * carrying a second copy that would drift.
 */
public record PathResolveRequest(
        @NotEmpty(message = "no paths to resolve")
        List<@Valid PathCount> paths) {

    public record PathCount(
            @NotBlank(message = "a path is required")
            String pathKey,
            Integer questionCount) {
    }
}
