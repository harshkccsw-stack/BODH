package com.bodhpsychometric.model.questionnaire;

import com.bodhpsychometric.model.auth.enums.Vertical;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity  
@Table(name = "Questionnaire" )
public class Questionnaire implements java.io.Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = jakarta.persistence.GenerationType.IDENTITY)
    private Long questionnaireId;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Column(name = "shortName", length = 50)
    private String shortName;

    @Column(name = "category", length = 100)
    private String category;

    // STRING, not ordinal: the column stays readable varchar and reordering
    // the Vertical enum can never corrupt stored rows.
    @Enumerated(EnumType.STRING)
    @Column(name = "vertical", length = 100)
    private Vertical vertical;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "durationMinutes")
    private Integer durationMinutes;

    @Column(name = "generalInstruction", columnDefinition = "TEXT")
    private String generalInstruction;

    /**
     * Rendering switch: false — flat list, Section is ignored entirely;
     * true — questions are grouped by their Section, and the service must
     * ensure no question of this questionnaire is left sectionless.
     */
    @Column(name = "hasSections", nullable = false)
    private boolean hasSections;
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

    // Which bank questions appear here (and where) lives in
    // QuestionnaireQuestion rows — a question can be in many questionnaires,
    // so no collection on either side.

    public Long getQuestionnaireId() {
        return questionnaireId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getShortName() {
        return shortName;
    }

    public void setShortName(String shortName) {
        this.shortName = shortName;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public Vertical getVertical() {
        return vertical;
    }

    public void setVertical(Vertical vertical) {
        this.vertical = vertical;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Integer getDurationMinutes() {
        return durationMinutes;
    }

    public void setDurationMinutes(Integer durationMinutes) {
        this.durationMinutes = durationMinutes;
    }

    public String getGeneralInstruction() {
        return generalInstruction;
    }

    public void setGeneralInstruction(String generalInstruction) {
        this.generalInstruction = generalInstruction;
    }

    public boolean isHasSections() {
        return hasSections;
    }

    public void setHasSections(boolean hasSections) {
        this.hasSections = hasSections;
    }

}