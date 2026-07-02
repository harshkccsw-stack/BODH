package com.bodhpsychometric.bodhassess.payload;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Response for the unified {@code /auth/login}. Carries the token plus the
 * resolved identity so the two front-end login pages can decide where to land
 * (dashboard for super admin, portal for everyone else).
 */
public class AuthLoginResponse {

    private final String token;
    private final AuthUser user;

    public AuthLoginResponse(String token, AuthUser user) {
        this.token = token;
        this.user = user;
    }

    public String getToken() { return token; }
    public AuthUser getUser() { return user; }

    public static class AuthUser {
        private final String id;
        private final String email;
        private final String name;
        @JsonProperty("isSuperAdmin")
        private final boolean superAdmin;
        private final List<String> entityIds;
        // RBAC carried on the unified identity so the dashboard can gate routes
        // straight from /auth/me — no separate practitioner/admin me-call.
        private final List<String> roles;
        @JsonProperty("url_paths")
        private final List<String> urlPaths;

        public AuthUser(String id, String email, String name, boolean superAdmin,
                        List<String> entityIds, List<String> roles, List<String> urlPaths) {
            this.id = id;
            this.email = email;
            this.name = name;
            this.superAdmin = superAdmin;
            this.entityIds = entityIds;
            this.roles = roles;
            this.urlPaths = urlPaths;
        }

        public String getId() { return id; }
        public String getEmail() { return email; }
        public String getName() { return name; }
        public boolean isSuperAdmin() { return superAdmin; }
        public List<String> getEntityIds() { return entityIds; }
        public List<String> getRoles() { return roles; }
        public List<String> getUrlPaths() { return urlPaths; }
    }
}
