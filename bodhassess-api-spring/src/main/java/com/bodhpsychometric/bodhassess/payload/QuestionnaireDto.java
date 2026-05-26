package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;

public class QuestionnaireDto {
    private String id;
    private String name;
    private String shortName;
    private String vertical;
    private String category;
    private String description;
    private Integer duration;
    private String tier;
    private List<String> languages = new ArrayList<>();
    private JsonNode mqs;
    private JsonNode questions;
    private boolean isDemo;
    private String disclaimer;
    private String instructions;
    private boolean showInstructions;
    private List<String> demographicFieldKeys = new ArrayList<>();
    private String createdAt;

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
    public String getInstructions() { return instructions; }
    public void setInstructions(String instructions) { this.instructions = instructions; }
    public boolean isShowInstructions() { return showInstructions; }
    public void setShowInstructions(boolean showInstructions) { this.showInstructions = showInstructions; }
    public List<String> getDemographicFieldKeys() { return demographicFieldKeys; }
    public void setDemographicFieldKeys(List<String> demographicFieldKeys) { this.demographicFieldKeys = demographicFieldKeys; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
