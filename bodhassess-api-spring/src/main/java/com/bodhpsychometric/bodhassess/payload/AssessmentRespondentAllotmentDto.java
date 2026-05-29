package com.bodhpsychometric.bodhassess.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AssessmentRespondentAllotmentDto {
    @JsonProperty("assessmentId")    private String assessmentId;
    @JsonProperty("respondentId")    private String respondentId;
    @JsonProperty("respondentName")  private String respondentName;
    @JsonProperty("respondentEmail") private String respondentEmail;
    @JsonProperty("createdAt")       private String createdAt;

    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getRespondentId() { return respondentId; }
    public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
    public String getRespondentName() { return respondentName; }
    public void setRespondentName(String respondentName) { this.respondentName = respondentName; }
    public String getRespondentEmail() { return respondentEmail; }
    public void setRespondentEmail(String respondentEmail) { this.respondentEmail = respondentEmail; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
