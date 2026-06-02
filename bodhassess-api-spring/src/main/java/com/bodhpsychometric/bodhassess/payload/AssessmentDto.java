package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Wire shape for the first-class Assessment row — the reusable allotment
 * of a Questionnaire to a set of Allotees (entities, groups, individual
 * respondents). Carries cached display fields (questionnaireName,
 * vertical) so the All Assessments table doesn't need to join the
 * questionnaire to render. Sessions live separately on portal_sessions.
 */
public class AssessmentDto {
    private String id;
    private String name;
    @JsonProperty("questionnaireId")    private String questionnaireId;
    @JsonProperty("questionnaireName")  private String questionnaireName;
    private String vertical;
    private String language;
    // ACTIVE | CLOSED | PAUSED. All transitions reversible.
    private String status;
    @JsonProperty("createdAt")          private String createdAt;
    @JsonProperty("createdBy")          private String createdBy;
    @JsonProperty("updatedAt")          private String updatedAt;

    // Read-side aggregates filled by the service so the All Assessments
    // table can render counts without an extra round-trip.
    @JsonProperty("entityCount")        private Integer entityCount;
    @JsonProperty("groupCount")         private Integer groupCount;
    @JsonProperty("respondentCount")    private Integer respondentCount;
    @JsonProperty("sessionsCount")      private Integer sessionsCount;
    @JsonProperty("completedCount")     private Integer completedCount;

    // For the one-shot create flow: the initial allotments admin picks on
    // the create form. Each entity carries its own cap.
    @JsonProperty("entityAllotments")
    private List<AssessmentEntityAllotmentDto> entityAllotments = new ArrayList<>();
    @JsonProperty("groupAllotments")
    private List<String> groupAllotments = new ArrayList<>();
    @JsonProperty("respondentAllotments")
    private List<String> respondentAllotments = new ArrayList<>();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getQuestionnaireId() { return questionnaireId; }
    public void setQuestionnaireId(String questionnaireId) { this.questionnaireId = questionnaireId; }
    public String getQuestionnaireName() { return questionnaireName; }
    public void setQuestionnaireName(String questionnaireName) { this.questionnaireName = questionnaireName; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
    public Integer getEntityCount() { return entityCount; }
    public void setEntityCount(Integer entityCount) { this.entityCount = entityCount; }
    public Integer getGroupCount() { return groupCount; }
    public void setGroupCount(Integer groupCount) { this.groupCount = groupCount; }
    public Integer getRespondentCount() { return respondentCount; }
    public void setRespondentCount(Integer respondentCount) { this.respondentCount = respondentCount; }
    public Integer getSessionsCount() { return sessionsCount; }
    public void setSessionsCount(Integer sessionsCount) { this.sessionsCount = sessionsCount; }
    public Integer getCompletedCount() { return completedCount; }
    public void setCompletedCount(Integer completedCount) { this.completedCount = completedCount; }
    public List<AssessmentEntityAllotmentDto> getEntityAllotments() { return entityAllotments; }
    public void setEntityAllotments(List<AssessmentEntityAllotmentDto> entityAllotments) { this.entityAllotments = entityAllotments; }
    public List<String> getGroupAllotments() { return groupAllotments; }
    public void setGroupAllotments(List<String> groupAllotments) { this.groupAllotments = groupAllotments; }
    public List<String> getRespondentAllotments() { return respondentAllotments; }
    public void setRespondentAllotments(List<String> respondentAllotments) { this.respondentAllotments = respondentAllotments; }
}
