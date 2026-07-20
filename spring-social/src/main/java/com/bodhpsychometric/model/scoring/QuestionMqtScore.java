package com.bodhpsychometric.model.scoring;

import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;

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
 * Scoring edge: how much a question contributes to one MQT node — "Q1 scores
 * 5 on MQT1". A join table promoted to an entity because the association
 * carries a payload (the score), which @ManyToMany cannot hold.
 *
 * The unique pair means a question is scored at most once per MQT; the same
 * question may score on many MQTs and an MQT collects scores from many
 * questions. The MQT side has no cascade — deleting a node with score rows
 * attached fails at the FK instead of silently dropping scoring data.
 */
@Entity
@Table(name = "QuestionMqtScore",
        uniqueConstraints = @UniqueConstraint(name = "uqQmsQuestionMqt",
                columnNames = {"questionId", "measuredQualityTypeId"}),
        indexes = @Index(name = "idxQmsMqt", columnList = "measuredQualityTypeId"))
public class QuestionMqtScore implements java.io.Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long questionMqtScoreId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQmsQuestion"))
    private Question question;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "measuredQualityTypeId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQmsMqt"))
    private MeasuredQualityType measuredQualityType;

    @Column(name = "score", nullable = false)
    private int score;

    public Long getQuestionMqtScoreId() {
        return questionMqtScoreId;
    }

    public void setQuestionMqtScoreId(Long questionMqtScoreId) {
        this.questionMqtScoreId = questionMqtScoreId;
    }

    public Question getQuestion() {
        return question;
    }

    public void setQuestion(Question question) {
        this.question = question;
    }

    public MeasuredQualityType getMeasuredQualityType() {
        return measuredQualityType;
    }

    public void setMeasuredQualityType(MeasuredQualityType measuredQualityType) {
        this.measuredQualityType = measuredQualityType;
    }

    public int getScore() {
        return score;
    }

    public void setScore(int score) {
        this.score = score;
    }
}
