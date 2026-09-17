package com.bodhpsychometric.model.baseline;

import java.time.OffsetDateTime;

import com.bodhpsychometric.model.auth.RespondentUser;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * One respondent's answer to one baseline question: a number from one to five.
 * Not cascade-mapped — a respondent delete clears these explicitly, and a
 * question with answers cannot be deleted.
 */
@Entity
@Table(name = "BaselineAnswer",
        uniqueConstraints = {
                @UniqueConstraint(name = "uqBaRespondentQuestion",
                        columnNames = { "respondentUserId", "baselineQuestionId" })
        })
public class BaselineAnswer implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    public static final int MIN_VALUE = 1;
    public static final int MAX_VALUE = 5;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "baselineAnswerId")
    private Long baselineAnswerId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "respondentUserId", nullable = false,
            foreignKey = @ForeignKey(name = "fkBaRespondent"))
    private RespondentUser respondent;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "baselineQuestionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkBaQuestion"))
    private BaselineQuestion question;

    /** 1..5 on the fixed scale. Named answerValue because VALUE is reserved in H2. */
    @Column(name = "answerValue", nullable = false)
    private int answerValue;

    @Column(name = "recordedAt", nullable = false)
    private OffsetDateTime recordedAt;

    public Long getBaselineAnswerId() { return baselineAnswerId; }
    public RespondentUser getRespondent() { return respondent; }
    public void setRespondent(RespondentUser respondent) { this.respondent = respondent; }
    public BaselineQuestion getQuestion() { return question; }
    public void setQuestion(BaselineQuestion question) { this.question = question; }
    public int getAnswerValue() { return answerValue; }
    public void setAnswerValue(int answerValue) { this.answerValue = answerValue; }
    public OffsetDateTime getRecordedAt() { return recordedAt; }
    public void setRecordedAt(OffsetDateTime recordedAt) { this.recordedAt = recordedAt; }
}
