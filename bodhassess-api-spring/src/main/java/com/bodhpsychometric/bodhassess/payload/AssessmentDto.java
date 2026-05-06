package com.bodhpsychometric.bodhassess.payload;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AssessmentDto {

    private String id;
    private String name;
    @JsonProperty("respondentId")        private String respondentId;
    @JsonProperty("respondent")          private String respondentName;
    @JsonProperty("respondentEmail")     private String respondentEmail;
    private String instrument;
    @JsonProperty("instrumentFullName")  private String instrumentFullName;
    private String vertical;
    private String language;
    private String status;
    private String score;
    private Map<String, Object> answers;
    @JsonProperty("mqtScores")           private Map<String, Object> mqtScores;
    private Map<String, Object> demographics;
    @JsonProperty("groupId")             private String groupId;
    @JsonProperty("groupName")           private String groupName;
    @JsonProperty("consentId")           private String consentId;
    private boolean proctoring;
    @JsonProperty("invitationSent")      private boolean invitationSent;
    @JsonProperty("createdAt")           private String createdAt;
    @JsonProperty("completedAt")         private String completedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getRespondentId() { return respondentId; }
    public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
    public String getRespondentName() { return respondentName; }
    public void setRespondentName(String respondentName) { this.respondentName = respondentName; }
    public String getRespondentEmail() { return respondentEmail; }
    public void setRespondentEmail(String respondentEmail) { this.respondentEmail = respondentEmail; }
    public String getInstrument() { return instrument; }
    public void setInstrument(String instrument) { this.instrument = instrument; }
    public String getInstrumentFullName() { return instrumentFullName; }
    public void setInstrumentFullName(String instrumentFullName) { this.instrumentFullName = instrumentFullName; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getScore() { return score; }
    public void setScore(String score) { this.score = score; }
    public Map<String, Object> getAnswers() { return answers; }
    public void setAnswers(Map<String, Object> answers) { this.answers = answers; }
    public Map<String, Object> getMqtScores() { return mqtScores; }
    public void setMqtScores(Map<String, Object> mqtScores) { this.mqtScores = mqtScores; }
    public Map<String, Object> getDemographics() { return demographics; }
    public void setDemographics(Map<String, Object> demographics) { this.demographics = demographics; }
    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }
    public String getGroupName() { return groupName; }
    public void setGroupName(String groupName) { this.groupName = groupName; }
    public String getConsentId() { return consentId; }
    public void setConsentId(String consentId) { this.consentId = consentId; }
    public boolean isProctoring() { return proctoring; }
    public void setProctoring(boolean proctoring) { this.proctoring = proctoring; }
    public boolean isInvitationSent() { return invitationSent; }
    public void setInvitationSent(boolean invitationSent) { this.invitationSent = invitationSent; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getCompletedAt() { return completedAt; }
    public void setCompletedAt(String completedAt) { this.completedAt = completedAt; }

    public static class BulkAssessmentRequest {
        private List<AssessmentDto> assessments;
        public List<AssessmentDto> getAssessments() { return assessments; }
        public void setAssessments(List<AssessmentDto> assessments) { this.assessments = assessments; }
    }

    public static class BulkAssessmentResponse {
        private int created;
        public BulkAssessmentResponse() {}
        public BulkAssessmentResponse(int created) { this.created = created; }
        public int getCreated() { return created; }
        public void setCreated(int created) { this.created = created; }
    }
}
