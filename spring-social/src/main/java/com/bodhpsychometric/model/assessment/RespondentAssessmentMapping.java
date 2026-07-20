package com.bodhpsychometric.model.assessment;

import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.auth.RespondentUser;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * One attempt: this respondent taking this assessment once. A re-attempt is a
 * new row with the next attemptNumber, so every attempt keeps its own status
 * and its own answers (answers reference this row). The unique triple stops
 * two rows claiming the same attempt slot; the service assigns attemptNumber
 * as highest-so-far + 1.
 */
@Entity
@Table(name = "RespondentAssessmentMapping",
        uniqueConstraints = @UniqueConstraint(name = "uqRamRespondentAssessmentAttempt",
                columnNames = {"respondentUserId", "assessmentId", "attemptNumber"}),
        indexes = @Index(name = "idxRamAssessment", columnList = "assessmentId"))
public class RespondentAssessmentMapping implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long respondentAssessmentMappingId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "respondentUserId", nullable = false,
            foreignKey = @ForeignKey(name = "fkRamRespondent"))
    private RespondentUser respondent;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assessmentId", nullable = false,
            foreignKey = @ForeignKey(name = "fkRamAssessment"))
    private Assessment assessment;

    // 1-based; a re-attempt gets the next number.
    @Column(name = "attemptNumber", nullable = false)
    private int attemptNumber = 1;

    @Enumerated(EnumType.STRING)
    @Column(name = "assessmentStatus", nullable = false, length = 16)
    private RespondentAssessmentStatus assessmentStatus = RespondentAssessmentStatus.NOT_STARTED;

    // Reserved for later use.
    @Column(name = "isPersisted", nullable = false)
    private boolean persisted;

    public Long getRespondentAssessmentMappingId() {
        return respondentAssessmentMappingId;
    }

    public void setRespondentAssessmentMappingId(Long respondentAssessmentMappingId) {
        this.respondentAssessmentMappingId = respondentAssessmentMappingId;
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

    public int getAttemptNumber() {
        return attemptNumber;
    }

    public void setAttemptNumber(int attemptNumber) {
        this.attemptNumber = attemptNumber;
    }

    public RespondentAssessmentStatus getAssessmentStatus() {
        return assessmentStatus;
    }

    public void setAssessmentStatus(RespondentAssessmentStatus assessmentStatus) {
        this.assessmentStatus = assessmentStatus;
    }

    public boolean isPersisted() {
        return persisted;
    }

    public void setPersisted(boolean persisted) {
        this.persisted = persisted;
    }
}
