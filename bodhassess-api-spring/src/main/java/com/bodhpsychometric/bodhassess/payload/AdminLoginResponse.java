package com.bodhpsychometric.bodhassess.payload;

public class AdminLoginResponse {
    private String token;
    private AdminInfo admin;

    public AdminLoginResponse() {}
    public AdminLoginResponse(String token, AdminInfo admin) {
        this.token = token;
        this.admin = admin;
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public AdminInfo getAdmin() { return admin; }
    public void setAdmin(AdminInfo admin) { this.admin = admin; }

    public static class AdminInfo {
        private String username;
        private String role = "ADMIN";

        public AdminInfo() {}
        public AdminInfo(String username) { this.username = username; }

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }
    }
}
