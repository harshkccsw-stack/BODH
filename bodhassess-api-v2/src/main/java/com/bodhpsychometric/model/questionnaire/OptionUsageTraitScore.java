package com.bodhpsychometric.model.questionnaire;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.model.base.BaseEntity;
import com.bodhpsychometric.model.taxonomy.TraitPlacement;

/**
 * Option-level trait credit for one usage — granted when this option is
 * chosen in this questionnaire. Reverse-coding a shared item = different
 * values here per questionnaire, no item duplication.
 */
@Entity
@Table(name = "OptionUsageTraitScore",
        uniqueConstraints = @UniqueConstraint(name = "uqOptionUsagePlacement",
                columnNames = {"questionnaireItemOptionId", "placementId"}),
        indexes = @Index(name = "idxOptionUsageScorePlacement", columnList = "placementId"))
public class OptionUsageTraitScore extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireItemOptionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkOptionUsageScoreOptionUsage"))
    private QuestionnaireItemOption optionUsage;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "placementId", nullable = false,
            foreignKey = @ForeignKey(name = "fkOptionUsageScorePlacement"))
    private TraitPlacement placement;

    @Column(name = "value", nullable = false)
    private double value;

    public QuestionnaireItemOption getOptionUsage() { return optionUsage; }
    public void setOptionUsage(QuestionnaireItemOption optionUsage) { this.optionUsage = optionUsage; }
    public TraitPlacement getPlacement() { return placement; }
    public void setPlacement(TraitPlacement placement) { this.placement = placement; }
    public double getValue() { return value; }
    public void setValue(double value) { this.value = value; }
}
