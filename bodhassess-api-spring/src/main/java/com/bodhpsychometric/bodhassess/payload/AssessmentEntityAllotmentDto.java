package com.bodhpsychometric.bodhassess.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Wire shape for one (Assessment, Entity) allotment with its per-pair
 * cap. Used both as request payload (admin creates an allotment) and
 * read payload (Allotees popup, edit form). Carries the entity's display
 * name so the UI doesn't have to look it up separately.
 */
public class AssessmentEntityAllotmentDto {
    @JsonProperty("assessmentId") private String assessmentId;
    @JsonProperty("entityId")     private String entityId;
    @JsonProperty("entityName")   private String entityName;
    // Cap on (assessment, entity) sessions. null = unlimited.
    private Integer cap;
    // Read-only aggregates the service fills in.
    @JsonProperty("sessionsCount")  private Integer sessionsCount;
    @JsonProperty("completedCount") private Integer completedCount;
    @JsonProperty("createdAt")      private String createdAt;

    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }
    public String getEntityName() { return entityName; }
    public void setEntityName(String entityName) { this.entityName = entityName; }
    public Integer getCap() { return cap; }
    public void setCap(Integer cap) { this.cap = cap; }
    public Integer getSessionsCount() { return sessionsCount; }
    public void setSessionsCount(Integer sessionsCount) { this.sessionsCount = sessionsCount; }
    public Integer getCompletedCount() { return completedCount; }
    public void setCompletedCount(Integer completedCount) { this.completedCount = completedCount; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
