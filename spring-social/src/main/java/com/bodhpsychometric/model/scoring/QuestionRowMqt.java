package com.bodhpsychometric.model.scoring;

import com.bodhpsychometric.model.question.QuestionRow;
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
 * Scoring edge of one grid ROW: what answering the item contributes to one
 * MQT — "row 2 scores 3 on Extraversion". The third member of the scoring
 * family, at row granularity; since V37 (2026-09-29) it carries a score like
 * the other two. The score is earned by ANSWERING the row, whatever column
 * was picked: the column is the answer, not the number.
 *
 * <p>Two things this edge also still is. A NOMINATION: the key set of a
 * row's edges filters the column's scores ({@link OptionMqtScore}), so a pick
 * on row R of column C credits only the MQTs R names, each with the score C
 * carries — the V15 rule, kept for grids whose columns are scored. And 0 is
 * a pure nomination, which is what every edge written before the column
 * existed means. A row may name several MQTs and an MQT may be named by many
 * rows; the pair is unique, so a row scores each MQT at most once.
 *
 * Same ownership rule as the other two: this flow rebuilds the rows on every
 * question update, and the MQT side has no cascade — deleting a node that a
 * grid still names fails at the FK instead of silently unscoring the grid.
 */
@Entity
@Table(name = "QuestionRowMqt",
        uniqueConstraints = @UniqueConstraint(name = "uqQrmRowMqt",
                columnNames = {"questionRowId", "measuredQualityTypeId"}),
        indexes = @Index(name = "idxQrmMqt", columnList = "measuredQualityTypeId"))
public class QuestionRowMqt implements java.io.Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long questionRowMqtId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionRowId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQrmRow"))
    private QuestionRow questionRow;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "measuredQualityTypeId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQrmMqt"))
    private MeasuredQualityType measuredQualityType;

    /**
     * What answering this row contributes to the MQT, to 2 decimals — a
     * DOUBLE like its two siblings (V37). Rounded on the way in by
     * QuestionController#dedupe: nothing else may write it.
     */
    @Column(name = "score", nullable = false)
    private double score;

    public Long getQuestionRowMqtId() {
        return questionRowMqtId;
    }

    public void setQuestionRowMqtId(Long questionRowMqtId) {
        this.questionRowMqtId = questionRowMqtId;
    }

    public QuestionRow getQuestionRow() {
        return questionRow;
    }

    public void setQuestionRow(QuestionRow questionRow) {
        this.questionRow = questionRow;
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
