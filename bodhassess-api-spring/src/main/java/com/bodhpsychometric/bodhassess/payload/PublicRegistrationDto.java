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

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getDob() { return dob; }
    public void setDob(String dob) { this.dob = dob; }

    public static class Result {
        @JsonProperty("sessionId")    private String sessionId;
        @JsonProperty("respondentId") private String respondentId;
        @JsonProperty("assessmentId") private String assessmentId;

        public Result() {}
        public Result(String sessionId, String respondentId, String assessmentId) {
            this.sessionId = sessionId;
            this.respondentId = respondentId;
            this.assessmentId = assessmentId;
        }
        public String getSessionId() { return sessionId; }
        public void setSessionId(String sessionId) { this.sessionId = sessionId; }
        public String getRespondentId() { return respondentId; }
        public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
        public String getAssessmentId() { return assessmentId; }
        public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    }
}
