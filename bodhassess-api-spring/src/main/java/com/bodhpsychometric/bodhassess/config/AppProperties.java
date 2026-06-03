package com.bodhpsychometric.bodhassess.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private final Auth auth = new Auth();
    private final Cors cors = new Cors();
    private final Uploads uploads = new Uploads();
    private final Heartbeat heartbeat = new Heartbeat();
    private final Bootstrap bootstrap = new Bootstrap();

    public Auth getAuth() { return auth; }
    public Cors getCors() { return cors; }
    public Uploads getUploads() { return uploads; }
    public Heartbeat getHeartbeat() { return heartbeat; }
    public Bootstrap getBootstrap() { return bootstrap; }

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

    /**
     * Seed account created on startup (create-if-absent) so the very first
     * super admin can log in. This is the only privileged-access seam now that
     * the env username/password path is retired — all auth flows through /auth.
     */
    public static class Bootstrap {
        private String superAdminEmail;
        private String superAdminDob;

        public String getSuperAdminEmail() { return superAdminEmail; }
        public void setSuperAdminEmail(String superAdminEmail) { this.superAdminEmail = superAdminEmail; }

        public String getSuperAdminDob() { return superAdminDob; }
        public void setSuperAdminDob(String superAdminDob) { this.superAdminDob = superAdminDob; }
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
