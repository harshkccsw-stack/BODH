package com.bodhpsychometric.bodhassess.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

public class AssessmentGroupAllotmentDto {
    @JsonProperty("assessmentId") private String assessmentId;
    @JsonProperty("groupId")      private String groupId;
    @JsonProperty("groupName")    private String groupName;
    @JsonProperty("memberCount")  private Integer memberCount;
    @JsonProperty("createdAt")    private String createdAt;

    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }
    public String getGroupName() { return groupName; }
    public void setGroupName(String groupName) { this.groupName = groupName; }
    public Integer getMemberCount() { return memberCount; }
    public void setMemberCount(Integer memberCount) { this.memberCount = memberCount; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
