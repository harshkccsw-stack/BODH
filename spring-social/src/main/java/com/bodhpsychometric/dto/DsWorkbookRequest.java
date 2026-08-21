package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create/update payload for a Data Studio workbook. The owner is never in the
 * body — it is whoever the bearer token says is calling, so a workbook cannot
 * be created on someone else's behalf by editing a request.
 */
public record DsWorkbookRequest(
        @NotBlank(message = "Name is required")
        @Size(max = 160, message = "Name must be at most 160 characters") String name,
        @Size(max = 512, message = "Description must be at most 512 characters") String description) {
}
