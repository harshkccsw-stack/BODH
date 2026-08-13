package com.bodhpsychometric.model.assessment;

import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.QuestionRow;

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
 * One marked answer of one respondent's single answer set for an assessment.
 * Parent is the (respondent, assessment) pair — NOT the attempt row — so a
 * pair holds exactly one answer set, never one per attempt. Attempt rows
 * ({@link RespondentAssessmentMapping}) keep only delivery status; a granted
 * re-attempt REPLACES the pair's answer set on submit (latest wins,
 * longitudinal waves are deliberately not stored here).
 *
 * One row per selected option — and on a LIKERT_GRID, per (row, option): the
 * grid's rows share their columns, so the same (question, option) pair
 * legitimately repeats once per row and questionRowId is what tells them
 * apart. answerText and rankOrder are reserved payloads for response styles
 * that are not modelled yet (free-text answers, ranking).
 *
 * The unique constraint declared here is NOT what MySQL enforces. MySQL
 * treats NULLs as never equal, so a plain five-column key would stop
 * constraining every NON-grid answer (questionRowId null) — the guarantee
 * that turns a duplicated submit into a clean 400 instead of a 500 at commit.
 * V15 therefore builds it with a functional key part over
 * COALESCE(question_row_id, 0), which JPA cannot express; the declaration
 * here is what the H2 test schema gets. Hibernate's validate inspects tables,
 * columns and types — never index expressions — so the two never collide.
 *
 * Two rules the mapping cannot express, enforced in the service: the option
 * must belong to the question on the same row, and so must the grid row.
 */
@Entity
@Table(name = "AssessmentAnswer",
        uniqueConstraints = @UniqueConstraint(name = "uqAaRespondentAssessmentQuestionRowOption",
                columnNames = {"respondentUserId", "assessmentId", "questionId", "questionRowId", "optionId"}),
        indexes = {
                @Index(name = "idxAaAssessment", columnList = "assessmentId"),
                @Index(name = "idxAaQuestion", columnList = "questionId"),
                @Index(name = "idxAaOption", columnList = "optionId")
        })
public class AssessmentAnswer implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long assessmentAnswerId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "respondentUserId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAaRespondent"))
    private RespondentUser respondent;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assessmentId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAaAssessment"))
    private Assessment assessment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAaQuestion"))
    private Question question;

    /** The chosen option; null for formats without options (FREE_TEXT). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "optionId",
            foreignKey = @ForeignKey(name = "fkAaOption"))
    private Option option;

    /**
     * WHICH grid row this rating answers — null on every other question type,
     * where the question itself is the whole item. Set exactly when the
     * question is a LIKERT_GRID, and what makes a grid's several rows
     * distinguishable when they pick the same column.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "questionRowId",
            foreignKey = @ForeignKey(name = "fkAaQuestionRow"))
    private QuestionRow questionRow;

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

    public RespondentUser getRespondent() {
        return respondent;
    }

    public void setRespondent(RespondentUser respondent) {
        this.respondent = respondent;
    }

    public Assessment getAssessment() {
        return assessment;
    }

    public void setAssessment(Assessment assessment) {
        this.assessment = assessment;
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

    public QuestionRow getQuestionRow() {
        return questionRow;
    }

    public void setQuestionRow(QuestionRow questionRow) {
        this.questionRow = questionRow;
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
