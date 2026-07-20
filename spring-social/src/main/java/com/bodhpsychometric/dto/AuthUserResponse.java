package com.bodhpsychometric.dto;

import java.util.Set;

/**
 * The signed-in identity as the frontend consumes it. urlPaths is the union
 * of the role group's paths; empty for a superadmin, whose superAdmin flag
 * overrides path checks entirely.
 */
public record AuthUserResponse(
        Long id,
        String serialId,
        String email,
        boolean superAdmin,
        boolean dashboardAccess,
        Set<String> urlPaths) {
}
