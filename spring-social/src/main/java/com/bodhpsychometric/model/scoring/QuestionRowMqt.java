package com.bodhpsychometric.model.scoring;

import com.bodhpsychometric.model.question.QuestionRow;
import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;

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
 * Which MQT one grid ROW measures — "row 2 is an Extraversion item". The
 * odd one out of the scoring family: it carries NO score, because the number
 * comes from the column the respondent picks ({@link OptionMqtScore}). A row
 * may name several MQTs and an MQT may be named by many rows; the pair is
 * unique, so a row nominates each MQT at most once.
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
}
