package com.bodhpsychometric.dto;

/**
 * Assigns (or clears) the one group a user holds. A null roleGroupId is the
 * legitimate "no dashboard menu" state, not a missing field — hence no
 * @NotNull.
 */
public record RoleGroupAssignRequest(Long roleGroupId) {
}
