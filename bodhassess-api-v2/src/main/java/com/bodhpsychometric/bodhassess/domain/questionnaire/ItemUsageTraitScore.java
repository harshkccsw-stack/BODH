package com.bodhpsychometric.bodhassess.domain.questionnaire;

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
 * Question-level trait credit for one usage — granted whenever the item is
 * answered at all in this questionnaire, regardless of which option was
 * picked. References a TraitPlacement (trait-in-MQ), never a bare trait.
 */
@Entity
@Table(name = "ItemUsageTraitScore",
        uniqueConstraints = @UniqueConstraint(name = "uqItemUsagePlacement",
                columnNames = {"questionnaireItemId", "placementId"}),
        indexes = @Index(name = "idxItemUsageScorePlacement", columnList = "placementId"))
public class ItemUsageTraitScore extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireItemId", nullable = false,
            foreignKey = @ForeignKey(name = "fkItemUsageScoreUsage"))
    private QuestionnaireItem usage;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "placementId", nullable = false,
            foreignKey = @ForeignKey(name = "fkItemUsageScorePlacement"))
    private TraitPlacement placement;

    @Column(name = "value", nullable = false)
    private double value;

    public QuestionnaireItem getUsage() { return usage; }
    public void setUsage(QuestionnaireItem usage) { this.usage = usage; }
    public TraitPlacement getPlacement() { return placement; }
    public void setPlacement(TraitPlacement placement) { this.placement = placement; }
    public double getValue() { return value; }
    public void setValue(double value) { this.value = value; }
}
