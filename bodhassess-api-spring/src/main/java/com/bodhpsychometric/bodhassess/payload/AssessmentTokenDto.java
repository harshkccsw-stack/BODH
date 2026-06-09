package com.bodhpsychometric.bodhassess.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Wire shape for a registration token, used both as request payload
 * (admin generates a link via the popup) and response payload (returns
 * the token so the UI can build the URL).
 */
public class AssessmentTokenDto {
    private String token;
    @JsonProperty("assessmentId") private String assessmentId;
    // Display-only, populated on the public resolve() so the /register page
    // can show the assessment + entity without hitting auth-gated endpoints.
    @JsonProperty("assessmentName") private String assessmentName;
    @JsonProperty("entityId")     private String entityId;
    @JsonProperty("entityName")   private String entityName;
    @JsonProperty("groupId")      private String groupId;
    @JsonProperty("groupName")    private String groupName;
    @JsonProperty("respondentId") private String respondentId;
    // Invitee email — input for a standalone link (drives reuse-by-email), and
    // echoed back. Not display-name like the others.
    @JsonProperty("email")        private String email;
    @JsonProperty("maxUses")      private Integer maxUses;
    @JsonProperty("usedCount")    private Integer usedCount;
    @JsonProperty("expiresAt")    private String expiresAt;
    @JsonProperty("createdAt")    private String createdAt;
    @JsonProperty("createdBy")    private String createdBy;

    // ---- Output-only: what kind of link the admin should hand out ----
    // "register" → /register?token=…  (recipient fills the form)
    // "login"    → /portal/login?email=…  (recipient is already a known user;
    //              the session is assigned, they just sign in and begin)
    @JsonProperty("kind")         private String kind;
    // Email to prefill on the sign-in step when kind == "login".
    @JsonProperty("loginEmail")   private String loginEmail;
    // The already-assigned session to open after a login-token sign-in, so the
    // public page can drop the respondent straight into the assessment.
    @JsonProperty("sessionId")    private String sessionId;

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getAssessmentName() { return assessmentName; }
    public void setAssessmentName(String assessmentName) { this.assessmentName = assessmentName; }
    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }
    public String getEntityName() { return entityName; }
    public void setEntityName(String entityName) { this.entityName = entityName; }
    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }
    public String getGroupName() { return groupName; }
    public void setGroupName(String groupName) { this.groupName = groupName; }
    public String getRespondentId() { return respondentId; }
    public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public Integer getMaxUses() { return maxUses; }
    public void setMaxUses(Integer maxUses) { this.maxUses = maxUses; }
    public Integer getUsedCount() { return usedCount; }
    public void setUsedCount(Integer usedCount) { this.usedCount = usedCount; }
    public String getExpiresAt() { return expiresAt; }
    public void setExpiresAt(String expiresAt) { this.expiresAt = expiresAt; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getLoginEmail() { return loginEmail; }
    public void setLoginEmail(String loginEmail) { this.loginEmail = loginEmail; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
}
