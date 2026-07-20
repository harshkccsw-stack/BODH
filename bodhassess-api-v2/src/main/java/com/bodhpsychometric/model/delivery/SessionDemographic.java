package com.bodhpsychometric.model.delivery;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.model.assessment.DemographicField;
import com.bodhpsychometric.model.base.BaseEntity;

/**
 * One demographic answer captured at attempt start. Per-attempt (re-entered
 * after an admin reset — mirrors the old behavior); value stays TEXT to
 * accept whatever shape the field type produces.
 */
@Entity
@Table(name = "SessionDemographic",
        uniqueConstraints = @UniqueConstraint(name = "uqDemographicAttemptField",
                columnNames = {"attemptId", "fieldId"}),
        indexes = @Index(name = "idxSessionDemographicField", columnList = "fieldId"))
public class SessionDemographic extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "attemptId", nullable = false,
            foreignKey = @ForeignKey(name = "fkSessionDemographicAttempt"))
    private AssessmentAttempt attempt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "fieldId", nullable = false,
            foreignKey = @ForeignKey(name = "fkSessionDemographicField"))
    private DemographicField field;

    @Column(name = "value", columnDefinition = "TEXT")
    private String value;

    public AssessmentAttempt getAttempt() { return attempt; }
    public void setAttempt(AssessmentAttempt attempt) { this.attempt = attempt; }
    public DemographicField getField() { return field; }
    public void setField(DemographicField field) { this.field = field; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
}
