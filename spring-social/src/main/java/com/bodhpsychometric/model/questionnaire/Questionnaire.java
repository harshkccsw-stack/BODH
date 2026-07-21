package com.bodhpsychometric.model.questionnaire;

import java.util.ArrayList;
import java.util.List;

import com.bodhpsychometric.model.auth.enums.Vertical;
import com.bodhpsychometric.model.question.Question;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
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

    /**
     * Inverse side of Questionnaire 1—* Question. Questions are independent
     * bank items that get ATTACHED here — no cascade on purpose: deleting a
     * questionnaire must never delete bank questions, and removeQuestion is a
     * detach (FK set null), not a delete.
     */
    @OneToMany(mappedBy = "questionnaire")
    @OrderBy("questionId ASC")
    private List<Question> questions = new ArrayList<>();

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

    public List<Question> getQuestions() {
        return questions;
    }

    public void setQuestions(List<Question> questions) {
        this.questions = questions;
    }

    /** Keeps both sides of the bidirectional link in sync. */
    public void addQuestion(Question question) {
        questions.add(question);
        question.setQuestionnaire(this);
    }

    public void removeQuestion(Question question) {
        questions.remove(question);
        question.setQuestionnaire(null);
    }
}