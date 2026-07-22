package com.bodhpsychometric.bodhassess.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AuditLogEntryDto {
    private Long id;
    @JsonProperty("actorId")    private String actorId;
    @JsonProperty("actorName")  private String actorName;
    private String action;
    @JsonProperty("targetType") private String targetType;
    @JsonProperty("targetId")   private String targetId;
    @JsonProperty("before")     private String beforeJson;
    @JsonProperty("after")      private String afterJson;
    @JsonProperty("createdAt")  private String createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getActorId() { return actorId; }
    public void setActorId(String actorId) { this.actorId = actorId; }
    public String getActorName() { return actorName; }
    public void setActorName(String actorName) { this.actorName = actorName; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }
    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }
    public String getBeforeJson() { return beforeJson; }
    public void setBeforeJson(String beforeJson) { this.beforeJson = beforeJson; }
    public String getAfterJson() { return afterJson; }
    public void setAfterJson(String afterJson) { this.afterJson = afterJson; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
