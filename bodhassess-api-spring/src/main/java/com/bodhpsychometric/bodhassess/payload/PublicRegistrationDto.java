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
}
