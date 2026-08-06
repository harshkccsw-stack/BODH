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
 * The allotment: this respondent may take this assessment. Exactly one row
 * per pair — the unique key enforces it, and there are no re-attempts, so a
 * respondent answers a given assessment once. Answers and demographic
 * responses hang off the same (respondent, assessment) pair.
 *
 * The two flags are the delivery state machine, and they are deliberately
 * independent because a Redis-backed take flow will later set them at
 * different moments:
 *   - assessmentStatus — where the respondent is: NOT_STARTED → ONGOING on
 *     begin, ONGOING → COMPLETED once answers are submitted.
 *   - isPersisted — the fact check that those answers actually reached
 *     MySQL. Today the submit writes both in one transaction, so COMPLETED
 *     implies persisted; once submissions land in Redis first, this is what
 *     proves the durable write happened.
 */
@Entity
@Table(name = "RespondentAssessmentMapping",
        uniqueConstraints = @UniqueConstraint(name = "uqRamRespondentAssessment",
                columnNames = {"respondentUserId", "assessmentId"}),
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

    @Enumerated(EnumType.STRING)
    @Column(name = "assessmentStatus", nullable = false, length = 16)
    private RespondentAssessmentStatus assessmentStatus = RespondentAssessmentStatus.NOT_STARTED;

    /** Set by the submit once the answers are committed to MySQL. */
    @Column(name = "isPersisted", nullable = false)
    private boolean persisted;

    /**
     * How many times the portal's inactivity "focus" popup was dismissed during
     * this attempt. Written by the submit, zeroed by a reset. Attempt-level, so
     * it lives here and not on the per-option AssessmentAnswer rows.
     */
    @Column(name = "popUpCount", nullable = false)
    private int popUpCount = 0;

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

    public int getPopUpCount() {
        return popUpCount;
    }

    public void setPopUpCount(int popUpCount) {
        this.popUpCount = popUpCount;
    }
}
