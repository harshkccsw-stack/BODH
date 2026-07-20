package com.bodhpsychometric.model.assessment;

import com.bodhpsychometric.model.question.Option;
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
 * One marked answer inside a respondent's run of an assessment. Parent is the
 * {@link RespondentAssessmentMapping} — not the respondent directly — so an
 * answer can never disagree with its allotment about who was answering which
 * assessment.
 *
 * One row per selected option. answerText and rankOrder are reserved
 * payloads for response styles that are not modelled yet (free-text answers,
 * ranking) — attempt style is deliberately absent from Question for now.
 *
 * One rule the mapping cannot express, enforce in the service: the option
 * must belong to the question on the same row.
 */
@Entity
@Table(name = "AssessmentAnswer",
        uniqueConstraints = @UniqueConstraint(name = "uqAaMappingQuestionOption",
                columnNames = {"respondentAssessmentMappingId", "questionId", "optionId"}),
        indexes = {
                @Index(name = "idxAaQuestion", columnList = "questionId"),
                @Index(name = "idxAaOption", columnList = "optionId")
        })
public class AssessmentAnswer implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long assessmentAnswerId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "respondentAssessmentMappingId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAaMapping"))
    private RespondentAssessmentMapping mapping;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAaQuestion"))
    private Question question;

    /** The chosen option; null for formats without options (FREE_TEXT). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "optionId",
            foreignKey = @ForeignKey(name = "fkAaOption"))
    private Option option;

    /** FREE_TEXT payload. */
    @Column(name = "answerText", columnDefinition = "TEXT")
    private String answerText;

    /** RANKING payload: the position the respondent gave this option. */
    @Column(name = "rankOrder")
    private Integer rankOrder;

    public Long getAssessmentAnswerId() {
        return assessmentAnswerId;
    }

    public void setAssessmentAnswerId(Long assessmentAnswerId) {
        this.assessmentAnswerId = assessmentAnswerId;
    }

    public RespondentAssessmentMapping getMapping() {
        return mapping;
    }

    public void setMapping(RespondentAssessmentMapping mapping) {
        this.mapping = mapping;
    }

    public Question getQuestion() {
        return question;
    }

    public void setQuestion(Question question) {
        this.question = question;
    }

    public Option getOption() {
        return option;
    }

    public void setOption(Option option) {
        this.option = option;
    }

    public String getAnswerText() {
        return answerText;
    }

    public void setAnswerText(String answerText) {
        this.answerText = answerText;
    }

    public Integer getRankOrder() {
        return rankOrder;
    }

    public void setRankOrder(Integer rankOrder) {
        this.rankOrder = rankOrder;
    }
}
