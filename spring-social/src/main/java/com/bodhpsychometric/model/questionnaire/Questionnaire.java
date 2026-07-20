package com.bodhpsychometric.model.questionnaire;

import java.util.ArrayList;
import java.util.List;

import com.bodhpsychometric.model.question.Question;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

    // Verticals stay a plain label until the deferred Vertical entity lands.
    @Column(name = "vertical", length = 100)
    private String vertical;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "durationMinutes")
    private Integer durationMinutes;

    @Column(name = "generalInstruction", columnDefinition = "TEXT")
    private String generalInstruction;
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
     * Inverse side of Questionnaire 1—* Question. Questions belong to this
     * catalog entry: cascade ALL + orphanRemoval means they are saved and
     * deleted with the questionnaire, and removing one from this list
     * deletes it (and, transitively, its options).
     */
    @OneToMany(mappedBy = "questionnaire", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("questionId ASC")
    private List<Question> questions = new ArrayList<>();

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