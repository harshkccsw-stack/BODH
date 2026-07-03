package com.bodhpsychometric.bodhassess.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private final Auth auth = new Auth();
    private final Cors cors = new Cors();
    private final Uploads uploads = new Uploads();
    private final Admin admin = new Admin();
    private final Heartbeat heartbeat = new Heartbeat();

    public Auth getAuth() { return auth; }
    public Cors getCors() { return cors; }
    public Uploads getUploads() { return uploads; }
    public Admin getAdmin() { return admin; }
    public Heartbeat getHeartbeat() { return heartbeat; }

    public static class Auth {
        private String tokenSecret;
        private long tokenExpirationMsec;

        public String getTokenSecret() { return tokenSecret; }
        public void setTokenSecret(String tokenSecret) { this.tokenSecret = tokenSecret; }

        public long getTokenExpirationMsec() { return tokenExpirationMsec; }
        public void setTokenExpirationMsec(long tokenExpirationMsec) { this.tokenExpirationMsec = tokenExpirationMsec; }
    }

    public static class Cors {
        private String[] allowedOrigins;

        public String[] getAllowedOrigins() { return allowedOrigins; }
        public void setAllowedOrigins(String[] allowedOrigins) { this.allowedOrigins = allowedOrigins; }
    }

    public static class Uploads {
        private String dir;
        private String baseUrl;

        public String getDir() { return dir; }
        public void setDir(String dir) { this.dir = dir; }

        public String getBaseUrl() { return baseUrl; }
        public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    }

    public static class Admin {
        private String username;
        private String password;

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }

        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
    }

    public static class Heartbeat {
        private long ttlSeconds = 30;
        private long idleThresholdSeconds = 15;

        public long getTtlSeconds() { return ttlSeconds; }
        public void setTtlSeconds(long ttlSeconds) { this.ttlSeconds = ttlSeconds; }

        public long getIdleThresholdSeconds() { return idleThresholdSeconds; }
        public void setIdleThresholdSeconds(long idleThresholdSeconds) { this.idleThresholdSeconds = idleThresholdSeconds; }
    }
}
