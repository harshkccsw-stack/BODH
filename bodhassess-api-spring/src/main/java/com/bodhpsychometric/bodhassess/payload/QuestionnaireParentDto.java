package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Wire shape for a Questionnaire parent — the row admins see in the
 * Question Bank list. Each parent has many versions; this DTO carries
 * just the metadata + version summaries (not the full content, which
 * lives on {@link QuestionnaireVersionSummaryDto} per version).
 */
public class QuestionnaireParentDto {
    private String id;
    private String name;
    private String vertical;
    @JsonProperty("currentVersionId")    private String currentVersionId;
    @JsonProperty("currentVersionLabel") private String currentVersionLabel;
    @JsonProperty("createdAt")           private String createdAt;
    @JsonProperty("createdBy")           private String createdBy;
    // Read-side aggregates filled in by the service.
    @JsonProperty("versionCount")        private Integer versionCount;
    @JsonProperty("draftCount")          private Integer draftCount;
    // Optional — included on the detail endpoint, not on the list one.
    @JsonProperty("versions")
    private List<QuestionnaireVersionSummaryDto> versions = new ArrayList<>();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getCurrentVersionId() { return currentVersionId; }
    public void setCurrentVersionId(String currentVersionId) { this.currentVersionId = currentVersionId; }
    public String getCurrentVersionLabel() { return currentVersionLabel; }
    public void setCurrentVersionLabel(String currentVersionLabel) { this.currentVersionLabel = currentVersionLabel; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public Integer getVersionCount() { return versionCount; }
    public void setVersionCount(Integer versionCount) { this.versionCount = versionCount; }
    public Integer getDraftCount() { return draftCount; }
    public void setDraftCount(Integer draftCount) { this.draftCount = draftCount; }
    public List<QuestionnaireVersionSummaryDto> getVersions() { return versions; }
    public void setVersions(List<QuestionnaireVersionSummaryDto> versions) { this.versions = versions; }
}
