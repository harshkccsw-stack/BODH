package com.bodhpsychometric.model.scoring;

import com.bodhpsychometric.model.question.Option;
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
 * Answer-dependent scoring edge: what choosing this option contributes to one
 * MQT node — "picking 'Strongly agree' scores 5 on MQT1". Same association-
 * entity pattern as {@link QuestionMqtScore}, at option granularity: the pair
 * is unique, and the MQT side has no cascade so score rows are never dropped
 * silently.
 */
@Entity
@Table(name = "OptionMqtScore",
        uniqueConstraints = @UniqueConstraint(name = "uqOmsOptionMqt",
                columnNames = {"optionId", "measuredQualityTypeId"}),
        indexes = @Index(name = "idxOmsMqt", columnList = "measuredQualityTypeId"))
public class OptionMqtScore implements java.io.Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long optionMqtScoreId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "optionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkOmsOption"))
    private Option option;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "measuredQualityTypeId", nullable = false,
            foreignKey = @ForeignKey(name = "fkOmsMqt"))
    private MeasuredQualityType measuredQualityType;

    /**
     * What this edge contributes, to 2 decimals — a DOUBLE column since V25,
     * so an option can half-count (0.5) or move in quarter steps. Rounded on
     * the way in by QuestionController#dedupe: nothing else may write it.
     */
    @Column(name = "score", nullable = false)
    private double score;

    public Long getOptionMqtScoreId() {
        return optionMqtScoreId;
    }

    public void setOptionMqtScoreId(Long optionMqtScoreId) {
        this.optionMqtScoreId = optionMqtScoreId;
    }

    public Option getOption() {
        return option;
    }

    public void setOption(Option option) {
        this.option = option;
    }

    public MeasuredQualityType getMeasuredQualityType() {
        return measuredQualityType;
    }

    public void setMeasuredQualityType(MeasuredQualityType measuredQualityType) {
        this.measuredQualityType = measuredQualityType;
    }

    public double getScore() {
        return score;
    }

    public void setScore(double score) {
        this.score = score;
    }
}
