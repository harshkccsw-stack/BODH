package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.auth.Role;

/** A role named inside a group listing — id and label only, no paths. */
public record RoleRefResponse(Long id, String name) {

    public static RoleRefResponse from(Role role) {
        return new RoleRefResponse(role.getId(), role.getName());
    }
}
