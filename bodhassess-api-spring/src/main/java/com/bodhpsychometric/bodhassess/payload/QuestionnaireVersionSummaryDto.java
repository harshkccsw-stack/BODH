package com.bodhpsychometric.bodhassess.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Slim shape for a single version row — the version history list and
 * the version picker on the assessment-create form. Excludes the heavy
 * content (questions, MQs); use the existing {@link QuestionnaireDto}
 * to fetch the full payload of a specific version.
 */
public class QuestionnaireVersionSummaryDto {
    private String id;
    @JsonProperty("parentId")              private String parentId;
    @JsonProperty("versionMajor")          private Integer versionMajor;
    @JsonProperty("versionMinor")          private Integer versionMinor;
    @JsonProperty("versionLabel")          private String versionLabel;
    @JsonProperty("versionName")           private String versionName;
    @JsonProperty("versionComments")       private String versionComments;
    // DRAFT | COMMITTED.
    @JsonProperty("status")                private String status;
    @JsonProperty("branchedFromVersionId") private String branchedFromVersionId;
    @JsonProperty("committedAt")           private String committedAt;
    @JsonProperty("committedBy")           private String committedBy;
    @JsonProperty("isCurrent")             private Boolean isCurrent;
    // Read-side aggregate: how many assessments pin this version.
    @JsonProperty("inUseByAssessmentCount") private Integer inUseByAssessmentCount;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }
    public Integer getVersionMajor() { return versionMajor; }
    public void setVersionMajor(Integer versionMajor) { this.versionMajor = versionMajor; }
    public Integer getVersionMinor() { return versionMinor; }
    public void setVersionMinor(Integer versionMinor) { this.versionMinor = versionMinor; }
    public String getVersionLabel() { return versionLabel; }
    public void setVersionLabel(String versionLabel) { this.versionLabel = versionLabel; }
    public String getVersionName() { return versionName; }
    public void setVersionName(String versionName) { this.versionName = versionName; }
    public String getVersionComments() { return versionComments; }
    public void setVersionComments(String versionComments) { this.versionComments = versionComments; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getBranchedFromVersionId() { return branchedFromVersionId; }
    public void setBranchedFromVersionId(String branchedFromVersionId) { this.branchedFromVersionId = branchedFromVersionId; }
    public String getCommittedAt() { return committedAt; }
    public void setCommittedAt(String committedAt) { this.committedAt = committedAt; }
    public String getCommittedBy() { return committedBy; }
    public void setCommittedBy(String committedBy) { this.committedBy = committedBy; }
    public Boolean getIsCurrent() { return isCurrent; }
    public void setIsCurrent(Boolean isCurrent) { this.isCurrent = isCurrent; }
    public Integer getInUseByAssessmentCount() { return inUseByAssessmentCount; }
    public void setInUseByAssessmentCount(Integer inUseByAssessmentCount) { this.inUseByAssessmentCount = inUseByAssessmentCount; }
}
