package com.bodhpsychometric.model.question;

import com.bodhpsychometric.model.question.enums.QuestionType;

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

/**
 * One ROW of a {@link QuestionType#LIKERT_GRID} question — an item the
 * respondent rates against the shared columns ("Plan my week ahead", rated
 * Never…Always). Rows live and die with their question, exactly like
 * {@link Option}: cascade ALL + orphanRemoval on the Question side.
 *
 * A row carries no score of its own. Which qualities it measures is a
 * NOMINATION, held by {@code QuestionRowMqt}; how much a rating is worth
 * comes from the column ({@code OptionMqtScore}), which is scored exactly the
 * way an MCQ's options already are. So a pick on row R of column C credits
 * only R's MQTs, each with the score C carries for that MQT — the one scoring
 * rule a grid adds, and the reason {@code AssessmentAnswer} records the row.
 */
@Entity
@Table(name = "QuestionRow",
        indexes = @Index(name = "idxQrQuestion", columnList = "questionId"))
public class QuestionRow implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long questionRowId;

    /** Owning side: a row never exists without its question. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQrQuestion"))
    private Question question;

    @Column(name = "rowText", columnDefinition = "TEXT")
    private String rowText;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public Long getQuestionRowId() {
        return questionRowId;
    }

    public void setQuestionRowId(Long questionRowId) {
        this.questionRowId = questionRowId;
    }

    public Question getQuestion() {
        return question;
    }

    public void setQuestion(Question question) {
        this.question = question;
    }

    public String getRowText() {
        return rowText;
    }

    public void setRowText(String rowText) {
        this.rowText = rowText;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
