package com.bodhpsychometric.dto;

import java.util.Comparator;
import java.util.List;

import com.bodhpsychometric.model.auth.RoleGroup;

/**
 * A group as the dashboard lists it. urlPaths is the merged union of every
 * role inside — the same set login hands the frontend — so the editor can
 * show what this group actually opens without a second round trip.
 * memberCount is what blocks a delete.
 */
public record RoleGroupResponse(
        Long roleGroupId,
        String name,
        String description,
        List<RoleRefResponse> roles,
        List<String> urlPaths,
        long memberCount) {

    public static RoleGroupResponse from(RoleGroup group, long memberCount) {
        return new RoleGroupResponse(
                group.getRoleGroupId(),
                group.getName(),
                group.getDescription(),
                group.getRoles().stream()
                        .map(RoleRefResponse::from)
                        .sorted(Comparator.comparing(RoleRefResponse::name))
                        .toList(),
                group.allUrlPaths().stream().sorted().toList(),
                memberCount);
    }
}
