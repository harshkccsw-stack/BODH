package com.bodhpsychometric.model.questionnaire;

import com.bodhpsychometric.model.question.Question;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * Placement edge: this bank question appears in this questionnaire, in this
 * section (null on flat questionnaires), at this position. A question may
 * appear in many questionnaires — the unique pair only forbids appearing
 * twice in the SAME one. Section and order are per-placement, so the same
 * question can sit in "Part A" of one questionnaire and "Part C" of another.
 */
@Entity
@Table(name = "QuestionnaireQuestion",
        uniqueConstraints = @UniqueConstraint(name = "uqQqQuestionnaireQuestion",
                columnNames = {"questionnaireId", "questionId"}),
        indexes = {
                @Index(name = "idxQqQuestion", columnList = "questionId"),
                @Index(name = "idxQqSection", columnList = "sectionId")
        })
public class QuestionnaireQuestion implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long questionnaireQuestionId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQqQuestionnaire"))
    private Questionnaire questionnaire;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQqQuestion"))
    private Question question;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sectionId",
            foreignKey = @ForeignKey(name = "fkQqSection"))
    private Section section;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    /**
     * Report identifier of this placement, unique within its questionnaire:
     * "Section_A_Q_1" on sectioned questionnaires, "Q_1" on flat ones. The
     * same bank question tags differently in every questionnaire it appears
     * in. Regenerated wholesale on every placement save; nullable because
     * rows written before the tag existed stay null until re-saved.
     */
    @Column(name = "questionTag", length = 50)
    private String questionTag;

    public Long getQuestionnaireQuestionId() {
        return questionnaireQuestionId;
    }

    public void setQuestionnaireQuestionId(Long questionnaireQuestionId) {
        this.questionnaireQuestionId = questionnaireQuestionId;
    }

    public Questionnaire getQuestionnaire() {
        return questionnaire;
    }

    public void setQuestionnaire(Questionnaire questionnaire) {
        this.questionnaire = questionnaire;
    }

    public Question getQuestion() {
        return question;
    }

    public void setQuestion(Question question) {
        this.question = question;
    }

    public Section getSection() {
        return section;
    }

    public void setSection(Section section) {
        this.section = section;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public String getQuestionTag() {
        return questionTag;
    }

    public void setQuestionTag(String questionTag) {
        this.questionTag = questionTag;
    }
}
