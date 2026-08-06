package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/**
 * Create/update payload for a role group. roleIds is the whole membership
 * every time — update replaces it, same rule as a role's paths.
 */
public record RoleGroupRequest(
        @NotBlank(message = "Group name is required")
        @Size(max = 50, message = "Group name must be at most 50 characters") String name,

        String description,

        @NotEmpty(message = "Select at least one role for this group")
        List<Long> roleIds) {
}
