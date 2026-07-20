package com.bodhpsychometric.model.questionnaire;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import com.bodhpsychometric.model.base.SoftDeletableEntity;

/**
 * THE questionnaire — one table replacing the legacy instruments +
 * questionnaires split. There is no version pointer: assessments read this
 * live aggregate and {@link QuestionnaireChangeLog} records every edit.
 *
 * organization is the tenant: NULL = platform-global questionnaire, set =
 * owned by that organization.
 */
@Entity
@Table(name = "Questionnaire",
        indexes = @Index(name = "idxQuestionnaireOrganization", columnList = "organizationId"))
public class Questionnaire extends SoftDeletableEntity {

    private static final long serialVersionUID = 1L;


    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Column(name = "shortName", length = 50)
    private String shortName;

    @Column(name = "category", length = 100)
    private String category;

    // Verticals stay a plain label until the deferred Vertical entity lands.
    @Column(name = "vertical", length = 100)
    private String vertical;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "durationMinutes")
    private Integer durationMinutes;

    // ── Kept from the old catalog, to be refined in a later pass ─────────
    @Column(name = "tierRequired", length = 50)
    private String tierRequired;

    @Column(name = "isAdaptive", nullable = false)
    private boolean adaptive;

    @Column(name = "isFixedSequence", nullable = false)
    private boolean fixedSequence;

    @Column(name = "normStatus", length = 50)
    private String normStatus;

    @Column(name = "ageRange", length = 50)
    private String ageRange;

    @Column(name = "usesWeightedScoring", nullable = false)
    private boolean usesWeightedScoring;

    @Column(name = "scoringModel", length = 32)
    private String scoringModel;

    @OneToMany(mappedBy = "questionnaire", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<QuestionnaireSection> sections = new ArrayList<>();

    @OneToMany(mappedBy = "questionnaire", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<QuestionnaireItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "questionnaire", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<QuestionnaireDemographicField> demographicFields = new ArrayList<>();

   
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getShortName() { return shortName; }
    public void setShortName(String shortName) { this.shortName = shortName; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(Integer durationMinutes) { this.durationMinutes = durationMinutes; }
    public String getTierRequired() { return tierRequired; }
    public void setTierRequired(String tierRequired) { this.tierRequired = tierRequired; }
    public boolean isAdaptive() { return adaptive; }
    public void setAdaptive(boolean adaptive) { this.adaptive = adaptive; }
    public boolean isFixedSequence() { return fixedSequence; }
    public void setFixedSequence(boolean fixedSequence) { this.fixedSequence = fixedSequence; }
    public String getNormStatus() { return normStatus; }
    public void setNormStatus(String normStatus) { this.normStatus = normStatus; }
    public String getAgeRange() { return ageRange; }
    public void setAgeRange(String ageRange) { this.ageRange = ageRange; }
    public boolean isUsesWeightedScoring() { return usesWeightedScoring; }
    public void setUsesWeightedScoring(boolean usesWeightedScoring) { this.usesWeightedScoring = usesWeightedScoring; }
    public String getScoringModel() { return scoringModel; }
    public void setScoringModel(String scoringModel) { this.scoringModel = scoringModel; }
    public List<QuestionnaireSection> getSections() { return sections; }
    public void setSections(List<QuestionnaireSection> sections) { this.sections = sections; }
    public List<QuestionnaireItem> getItems() { return items; }
    public void setItems(List<QuestionnaireItem> items) { this.items = items; }
    public List<QuestionnaireDemographicField> getDemographicFields() { return demographicFields; }
    public void setDemographicFields(List<QuestionnaireDemographicField> demographicFields) { this.demographicFields = demographicFields; }

    public void addSection(QuestionnaireSection section) {
        sections.add(section);
        section.setQuestionnaire(this);
    }

    public void removeSection(QuestionnaireSection section) {
        sections.remove(section);
        section.setQuestionnaire(null);
    }

    public void addItem(QuestionnaireItem item) {
        items.add(item);
        item.setQuestionnaire(this);
    }

    public void removeItem(QuestionnaireItem item) {
        items.remove(item);
        item.setQuestionnaire(null);
    }

    public void addDemographicField(QuestionnaireDemographicField field) {
        demographicFields.add(field);
        field.setQuestionnaire(this);
    }

    public void removeDemographicField(QuestionnaireDemographicField field) {
        demographicFields.remove(field);
        field.setQuestionnaire(null);
    }
}
