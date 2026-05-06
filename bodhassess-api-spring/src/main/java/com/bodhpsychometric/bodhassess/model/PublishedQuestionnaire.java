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
@Table(name = "published_questionnaires")
@TypeDefs({
    @TypeDef(name = "json", typeClass = JsonStringType.class),
    @TypeDef(name = "json-node", typeClass = JsonNodeStringType.class)
})
public class PublishedQuestionnaire {

    @Id
    private String id;

    private String name;

    @Column(name = "short_name")
    private String shortName;

    private String vertical;

    private String category;

    @Column(columnDefinition = "text")
    private String description;

    private Integer duration;

    private String tier;

    @Type(type = "json")
    @Column(columnDefinition = "json")
    private List<String> languages = new ArrayList<>();

    @Type(type = "json-node")
    @Column(columnDefinition = "json")
    private JsonNode mqs;

    @Type(type = "json-node")
    @Column(columnDefinition = "json")
    private JsonNode questions;

    @Column(name = "is_demo")
    private boolean isDemo;

    @Column(columnDefinition = "text")
    private String disclaimer;

    @Type(type = "json")
    @Column(name = "demographic_field_keys", columnDefinition = "json")
    private List<String> demographicFieldKeys = new ArrayList<>();

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

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
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getDuration() { return duration; }
    public void setDuration(Integer duration) { this.duration = duration; }
    public String getTier() { return tier; }
    public void setTier(String tier) { this.tier = tier; }
    public List<String> getLanguages() { return languages; }
    public void setLanguages(List<String> languages) { this.languages = languages; }
    public JsonNode getMqs() { return mqs; }
    public void setMqs(JsonNode mqs) { this.mqs = mqs; }
    public JsonNode getQuestions() { return questions; }
    public void setQuestions(JsonNode questions) { this.questions = questions; }
    public boolean isDemo() { return isDemo; }
    public void setDemo(boolean demo) { isDemo = demo; }
    public String getDisclaimer() { return disclaimer; }
    public void setDisclaimer(String disclaimer) { this.disclaimer = disclaimer; }
    public List<String> getDemographicFieldKeys() { return demographicFieldKeys; }
    public void setDemographicFieldKeys(List<String> demographicFieldKeys) { this.demographicFieldKeys = demographicFieldKeys; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
