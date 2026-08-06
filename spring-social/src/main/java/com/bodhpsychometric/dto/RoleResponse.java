package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.auth.Role;

/**
 * A role as the dashboard lists it. urlPaths is sorted (the entity stores a
 * Set, whose order is undefined) so the editor and the list render the same
 * way twice in a row. groupCount is what the delete guard will complain
 * about — showing it up front stops the admin discovering it in an error.
 */
public record RoleResponse(
        Long id,
        String name,
        String description,
        List<String> urlPaths,
        long groupCount) {

    public static RoleResponse from(Role role, long groupCount) {
        return new RoleResponse(
                role.getId(),
                role.getName(),
                role.getDescription(),
                role.getUrlPaths().stream().sorted().toList(),
                groupCount);
    }
}
