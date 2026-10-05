package com.bodhpsychometric.dto;

/**
 * One row of the "assign role group" screen: ANY identity (2026-10-05 — it
 * used to list only practitioners and superadmins) with the group it holds
 * and which profiles it carries. One person may be practitioner AND
 * respondent; a group is what lets a respondent-only identity open the
 * dashboard.
 *
 * name comes from the practitioner profile, else the respondent one, so it
 * is null only for a bare superadmin — the frontend labels those. superAdmin
 * rows are listed but not assignable: the flag already grants everything, so
 * a group would be noise.
 */
public record DashboardUserResponse(
        Long userId,
        String serialId,
        String name,
        String email,
        boolean superAdmin,
        Long roleGroupId,
        String roleGroupName,
        boolean practitioner,
        boolean respondent) {
}
