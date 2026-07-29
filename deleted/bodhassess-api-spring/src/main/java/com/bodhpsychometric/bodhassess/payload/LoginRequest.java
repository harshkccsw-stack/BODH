package com.bodhpsychometric.bodhassess.payload;

/**
 * Login payload. We accept either {identifier, dob} (the new email-or-phone
 * flow) or the legacy {id, dob} so older clients keep working until they
 * upgrade. Services should call {@link #resolveIdentifier()} which prefers
 * {@code identifier} and falls back to {@code id}.
 */
public class LoginRequest {
    private String id;
    private String identifier;
    private String dob;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getIdentifier() { return identifier; }
    public void setIdentifier(String identifier) { this.identifier = identifier; }
    public String getDob() { return dob; }
    public void setDob(String dob) { this.dob = dob; }

    public String resolveIdentifier() {
        if (identifier != null && !identifier.trim().isEmpty()) return identifier.trim();
        if (id != null && !id.trim().isEmpty()) return id.trim();
        return "";
    }
}
