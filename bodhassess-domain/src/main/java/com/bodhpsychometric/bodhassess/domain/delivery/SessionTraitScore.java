package com.bodhpsychometric.bodhassess.domain.delivery;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.bodhassess.domain.base.BaseEntity;
import com.bodhpsychometric.bodhassess.domain.taxonomy.TraitPlacement;

/**
 * The frozen result: computed by the SERVER at submit from the usage scores
 * in effect at that moment, then never touched — later re-scoring of the
 * questionnaire changes future takers only. Placement-level rows only; MQ
 * rollups are derived in reports. The placement FK (RESTRICT) plus
 * soft-deleted taxonomy rows guarantee dimension labels survive forever.
 */
@Entity
@Table(name = "SessionTraitScore",
        uniqueConstraints = @UniqueConstraint(name = "uqScoreAttemptPlacement",
                columnNames = {"attemptId", "placementId"}),
        indexes = @Index(name = "idxScorePlacement", columnList = "placementId"))
public class SessionTraitScore extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "attemptId", nullable = false,
            foreignKey = @ForeignKey(name = "fkScoreAttempt"))
    private AssessmentAttempt attempt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "placementId", nullable = false,
            foreignKey = @ForeignKey(name = "fkScorePlacement"))
    private TraitPlacement placement;

    @Column(name = "value", nullable = false)
    private double value;

    public AssessmentAttempt getAttempt() { return attempt; }
    public void setAttempt(AssessmentAttempt attempt) { this.attempt = attempt; }
    public TraitPlacement getPlacement() { return placement; }
    public void setPlacement(TraitPlacement placement) { this.placement = placement; }
    public double getValue() { return value; }
    public void setValue(double value) { this.value = value; }
}
