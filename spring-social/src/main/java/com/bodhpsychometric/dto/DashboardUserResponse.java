package com.bodhpsychometric.dto;

/**
 * One row of the "assign role group" screen: an identity that may open the
 * dashboard (a practitioner, or a superadmin who has no practitioner profile)
 * together with the group it currently holds.
 *
 * name comes from the practitioner profile, so it is null for a bare
 * superadmin — the frontend labels those. superAdmin rows are listed but not
 * assignable: the flag already grants everything, so a group would be noise.
 */
public record DashboardUserResponse(
        Long userId,
        String serialId,
        String name,
        String email,
        boolean superAdmin,
        Long roleGroupId,
        String roleGroupName) {
}
