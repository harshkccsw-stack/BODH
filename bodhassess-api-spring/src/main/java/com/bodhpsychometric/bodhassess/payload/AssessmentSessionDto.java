package com.bodhpsychometric.bodhassess.payload;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonProperty;

// Wire shape for a PortalSession — one respondent's instance of an
// Assessment, holding their answers + scores. Renamed from AssessmentDto
// to free the "Assessment" name for the first-class Assessment object
// that sits between Questionnaire and Allotees.
public class AssessmentSessionDto {

    private String id;
    // Group key — the assessmentId points at the first-class Assessment
    // row this session belongs to. Same value across every session in
    // an Assessment's allotment fan-out.
    @JsonProperty("assessmentId")        private String assessmentId;
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
    @JsonProperty("entityId")            private String entityId;
    @JsonProperty("entityName")          private String entityName;
    @JsonProperty("consentId")           private String consentId;
    private boolean proctoring;
    @JsonProperty("invitationSent")      private boolean invitationSent;
    @JsonProperty("showQuestionIndex")   private boolean showQuestionIndex;
    @JsonProperty("createdAt")           private String createdAt;
    @JsonProperty("completedAt")         private String completedAt;
    @JsonProperty("startedAt")           private String startedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
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
    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }
    public String getEntityName() { return entityName; }
    public void setEntityName(String entityName) { this.entityName = entityName; }
    public String getConsentId() { return consentId; }
    public void setConsentId(String consentId) { this.consentId = consentId; }
    public boolean isProctoring() { return proctoring; }
    public void setProctoring(boolean proctoring) { this.proctoring = proctoring; }
    public boolean isInvitationSent() { return invitationSent; }
    public void setInvitationSent(boolean invitationSent) { this.invitationSent = invitationSent; }
    public boolean isShowQuestionIndex() { return showQuestionIndex; }
    public void setShowQuestionIndex(boolean showQuestionIndex) { this.showQuestionIndex = showQuestionIndex; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getCompletedAt() { return completedAt; }
    public void setCompletedAt(String completedAt) { this.completedAt = completedAt; }
    public String getStartedAt() { return startedAt; }
    public void setStartedAt(String startedAt) { this.startedAt = startedAt; }

    public static class BulkAssessmentRequest {
        private List<AssessmentSessionDto> assessments;
        public List<AssessmentSessionDto> getAssessments() { return assessments; }
        public void setAssessments(List<AssessmentSessionDto> assessments) { this.assessments = assessments; }
    }

    public static class BulkAssessmentResponse {
        private int created;
        private List<BulkAssessmentError> errors = new java.util.ArrayList<>();
        public BulkAssessmentResponse() {}
        public BulkAssessmentResponse(int created) { this.created = created; }
        public BulkAssessmentResponse(int created, List<BulkAssessmentError> errors) {
            this.created = created;
            this.errors = errors == null ? new java.util.ArrayList<>() : errors;
        }
        public int getCreated() { return created; }
        public void setCreated(int created) { this.created = created; }
        public List<BulkAssessmentError> getErrors() { return errors; }
        public void setErrors(List<BulkAssessmentError> errors) { this.errors = errors; }
    }

    public static class BulkAssessmentError {
        private int row;
        private String id;
        private String reason;
        public BulkAssessmentError() {}
        public BulkAssessmentError(int row, String id, String reason) {
            this.row = row; this.id = id; this.reason = reason;
        }
        public int getRow() { return row; }
        public void setRow(int row) { this.row = row; }
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getReason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
    }
}
