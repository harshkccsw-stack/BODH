package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;

/** The formula being type-checked as the user types it. */
public record DsExprRequest(@NotBlank(message = "expr is required") String expr) {
}
