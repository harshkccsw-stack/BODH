package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;
import org.hibernate.annotations.TypeDefs;

import com.fasterxml.jackson.databind.JsonNode;
import com.vladmihalcea.hibernate.type.json.JsonNodeStringType;
import com.vladmihalcea.hibernate.type.json.JsonStringType;

@Entity
@Table(name = "instruments")
@TypeDefs({
    @TypeDef(name = "json", typeClass = JsonStringType.class),
    @TypeDef(name = "json-node", typeClass = JsonNodeStringType.class)
})
public class QuestionnaireCatalog {

    @Id
    @Column(columnDefinition = "char(36)")
    private String id;

    @Column(name = "tenant_id", columnDefinition = "char(36)")
    private String tenantId;

    private String name;

    @Column(name = "short_name")
    private String shortName;

    private String vertical;

    private String category;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "item_count")
    private Integer itemCount;

    @Column(name = "duration_minutes")
    private Integer durationMinutes;

    @Type(type = "json")
    @Column(columnDefinition = "json")
    private List<String> languages = new ArrayList<>();

    @Column(name = "tier_required")
    private String tierRequired;

    @Column(name = "is_adaptive")
    private boolean isAdaptive;

    @Column(name = "is_fixed_sequence")
    private boolean isFixedSequence;

    @Column(name = "norm_status")
    private String normStatus;

    @Column(name = "age_range")
    private String ageRange;

    @Column(name = "is_published")
    private boolean isPublished;

    @Column(name = "uses_weighted_scoring")
    private boolean usesWeightedScoring;

    @Type(type = "json-node")
    @Column(name = "scoring_config", columnDefinition = "json")
    private JsonNode scoringConfig;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getShortName() { return shortName; }
    public void setShortName(String shortName) { this.shortName = shortName; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getItemCount() { return itemCount; }
    public void setItemCount(Integer itemCount) { this.itemCount = itemCount; }
    public Integer getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(Integer durationMinutes) { this.durationMinutes = durationMinutes; }
    public List<String> getLanguages() { return languages; }
    public void setLanguages(List<String> languages) { this.languages = languages; }
    public String getTierRequired() { return tierRequired; }
    public void setTierRequired(String tierRequired) { this.tierRequired = tierRequired; }
    public boolean isAdaptive() { return isAdaptive; }
    public void setAdaptive(boolean adaptive) { isAdaptive = adaptive; }
    public boolean isFixedSequence() { return isFixedSequence; }
    public void setFixedSequence(boolean fixedSequence) { isFixedSequence = fixedSequence; }
    public String getNormStatus() { return normStatus; }
    public void setNormStatus(String normStatus) { this.normStatus = normStatus; }
    public String getAgeRange() { return ageRange; }
    public void setAgeRange(String ageRange) { this.ageRange = ageRange; }
    public boolean isPublished() { return isPublished; }
    public void setPublished(boolean published) { isPublished = published; }
    public boolean isUsesWeightedScoring() { return usesWeightedScoring; }
    public void setUsesWeightedScoring(boolean usesWeightedScoring) { this.usesWeightedScoring = usesWeightedScoring; }
    public JsonNode getScoringConfig() { return scoringConfig; }
    public void setScoringConfig(JsonNode scoringConfig) { this.scoringConfig = scoringConfig; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
