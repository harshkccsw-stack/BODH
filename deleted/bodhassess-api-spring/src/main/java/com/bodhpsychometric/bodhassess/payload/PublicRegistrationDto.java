package com.bodhpsychometric.bodhassess.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Request payload from the public /register page. The token in the URL
 * provides the assessment + optional entity/group context; this dto only
 * carries the respondent's own details.
 */
public class PublicRegistrationDto {
    private String name;
    private String email;
    private String phone;
    // ISO yyyy-MM-dd (the frontend converts dd/MM/yyyy before posting).
    private String dob;
    // Optional company identification number. Used (with email/phone + dob)
    // to detect a returning registrant and steer them to login.
    private String companyId;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getDob() { return dob; }
    public void setDob(String dob) { this.dob = dob; }
    public String getCompanyId() { return companyId; }
    public void setCompanyId(String companyId) { this.companyId = companyId; }

    /** Response for the pre-registration duplicate check. */
    public static class CheckResult {
        @JsonProperty("exists") private boolean exists;

        public CheckResult() {}
        public CheckResult(boolean exists) { this.exists = exists; }
        public boolean isExists() { return exists; }
        public void setExists(boolean exists) { this.exists = exists; }
    }

    public static class Result {
        @JsonProperty("sessionId")    private String sessionId;
        @JsonProperty("respondentId") private String respondentId;
        @JsonProperty("assessmentId") private String assessmentId;
        // RESPONDENT-scoped auth token so the SPA can drop the just-registered
        // person straight into the portal take flow without a second login.
        @JsonProperty("token")        private String token;

        public Result() {}
        public Result(String sessionId, String respondentId, String assessmentId, String token) {
            this.sessionId = sessionId;
            this.respondentId = respondentId;
            this.assessmentId = assessmentId;
            this.token = token;
        }
        public String getSessionId() { return sessionId; }
        public void setSessionId(String sessionId) { this.sessionId = sessionId; }
        public String getRespondentId() { return respondentId; }
        public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
        public String getAssessmentId() { return assessmentId; }
        public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
        public String getToken() { return token; }
        public void setToken(String token) { this.token = token; }
    }

    /**
     * Public, unauthenticated view of an entity used by the member
     * self-registration page — just enough to title the form ("Register to
     * &lt;name&gt;"). Deliberately omits contact/member details.
     */
    public static class EntityInfo {
        @JsonProperty("id")   private String id;
        @JsonProperty("name") private String name;

        public EntityInfo() {}
        public EntityInfo(String id, String name) { this.id = id; this.name = name; }
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
    }

    /**
     * Result of an entity member self-registration: the new respondent's id
     * plus the entity they joined. No session/token — the page sends the
     * registrant to the portal login (dob is the password) rather than
     * straight into an assessment.
     */
    public static class EntityMemberResult {
        @JsonProperty("respondentId") private String respondentId;
        @JsonProperty("entityId")     private String entityId;
        @JsonProperty("entityName")   private String entityName;
        @JsonProperty("email")        private String email;

        public EntityMemberResult() {}
        public EntityMemberResult(String respondentId, String entityId, String entityName, String email) {
            this.respondentId = respondentId;
            this.entityId = entityId;
            this.entityName = entityName;
            this.email = email;
        }
        public String getRespondentId() { return respondentId; }
        public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
        public String getEntityId() { return entityId; }
        public void setEntityId(String entityId) { this.entityId = entityId; }
        public String getEntityName() { return entityName; }
        public void setEntityName(String entityName) { this.entityName = entityName; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
    }
}
