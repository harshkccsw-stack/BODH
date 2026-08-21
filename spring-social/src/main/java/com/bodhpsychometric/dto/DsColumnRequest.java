package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create/update payload for a computed column. {@code colKey} is NOT here on
 * purpose: on create the server derives it from the label, and on update it
 * comes from the path — because other formulas reference the column by that
 * key, letting a rename change it would silently break them.
 *
 * <p>{@code evalTarget} is an optional override of what the parser inferred;
 * anything other than CLIENT or SERVER is ignored in favour of the inference.
 */
public record DsColumnRequest(
        @NotBlank(message = "Label is required")
        @Size(max = 160, message = "Label must be at most 160 characters") String label,
        @NotBlank(message = "Formula is required") String expr,
        String evalTarget,
        @Size(max = 40, message = "Format must be at most 40 characters") String format) {
}
