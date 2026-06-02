package com.bodhpsychometric.bodhassess.payload;

import org.springframework.util.StringUtils;

/**
 * Unified login payload: email + dob. Accepts {@code identifier} as an alias
 * for {@code email} so older clients that post {identifier, dob} keep working.
 */
public class AuthLoginRequest {
    private String email;
    private String identifier;
    private String dob;

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getIdentifier() { return identifier; }
    public void setIdentifier(String identifier) { this.identifier = identifier; }
    public String getDob() { return dob; }
    public void setDob(String dob) { this.dob = dob; }

    /** Prefer {@code email}, fall back to {@code identifier}; trimmed. */
    public String resolveEmail() {
        if (StringUtils.hasText(email)) return email.trim();
        if (StringUtils.hasText(identifier)) return identifier.trim();
        return "";
    }
}
