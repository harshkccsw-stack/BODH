package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

public class QuestionnaireCatalogDtos {

    public static class CreateQuestionnaireCatalogRequest {
        private String name;
        @JsonProperty("short_name")             private String shortName;
        private String vertical;
        private String category;
        private String description;
        @JsonProperty("duration_minutes")       private Integer durationMinutes;
        private List<String> languages = new ArrayList<>();
        @JsonProperty("tier_required")          private String tierRequired;
        @JsonProperty("is_adaptive")            private boolean isAdaptive;
        @JsonProperty("is_fixed_sequence")      private boolean isFixedSequence;
        @JsonProperty("tenant_id")              private String tenantId;
        @JsonProperty("uses_weighted_scoring")  private boolean usesWeightedScoring;
        @JsonProperty("scoring_config")         private JsonNode scoringConfig;

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
        public String getTenantId() { return tenantId; }
        public void setTenantId(String tenantId) { this.tenantId = tenantId; }
        public boolean isUsesWeightedScoring() { return usesWeightedScoring; }
        public void setUsesWeightedScoring(boolean usesWeightedScoring) { this.usesWeightedScoring = usesWeightedScoring; }
        public JsonNode getScoringConfig() { return scoringConfig; }
        public void setScoringConfig(JsonNode scoringConfig) { this.scoringConfig = scoringConfig; }
    }

    public static class CreateQuestionnaireCatalogResponse {
        private String id;
        private String name;
        private String vertical;
        private String message;

        public CreateQuestionnaireCatalogResponse() {}
        public CreateQuestionnaireCatalogResponse(String id, String name, String vertical, String message) {
            this.id = id; this.name = name; this.vertical = vertical; this.message = message;
        }
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getVertical() { return vertical; }
        public void setVertical(String vertical) { this.vertical = vertical; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }

    public static class QuestionnaireCatalogRow {
        private String id;
        private String name;
        @JsonProperty("short_name")        private String shortName;
        private String vertical;
        private String category;
        @JsonProperty("item_count")        private Integer itemCount;
        @JsonProperty("duration_minutes")  private Integer durationMinutes;
        private List<String> languages;
        @JsonProperty("tier_required")     private String tierRequired;
        @JsonProperty("is_adaptive")       private boolean isAdaptive;
        @JsonProperty("is_fixed_sequence") private boolean isFixedSequence;
        @JsonProperty("norm_status")       private String normStatus;
        @JsonProperty("age_range")         private String ageRange;
        @JsonProperty("is_published")      private boolean isPublished;
        @JsonProperty("created_at")        private String createdAt;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getShortName() { return shortName; }
        public void setShortName(String shortName) { this.shortName = shortName; }
        public String getVertical() { return vertical; }
        public void setVertical(String vertical) { this.vertical = vertical; }
        public String getCategory() { return category; }
        public void setCategory(String category) { this.category = category; }
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
        public String getCreatedAt() { return createdAt; }
        public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    }

    public static class QuestionnaireCatalogListResponse {
        private List<QuestionnaireCatalogRow> data;
        private int total;

        public QuestionnaireCatalogListResponse() {}
        public QuestionnaireCatalogListResponse(List<QuestionnaireCatalogRow> data, int total) {
            this.data = data; this.total = total;
        }
        public List<QuestionnaireCatalogRow> getData() { return data; }
        public void setData(List<QuestionnaireCatalogRow> data) { this.data = data; }
        public int getTotal() { return total; }
        public void setTotal(int total) { this.total = total; }
    }
}
