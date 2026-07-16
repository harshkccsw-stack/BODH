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
import com.bodhpsychometric.bodhassess.domain.item.AnswerOption;

/**
 * One selected option of an answer: single choice = one row, multi-select =
 * N rows, RANKING = N rows with rank (1-based, NULL for unranked formats).
 * Points at a frozen AnswerOption row, which is what makes the legacy
 * positional-index corruption structurally impossible.
 */
@Entity
@Table(name = "SessionAnswerOption",
        uniqueConstraints = @UniqueConstraint(name = "uqAnswerOption",
                columnNames = {"answerId", "optionId"}),
        indexes = @Index(name = "idxAnswerOptionOption", columnList = "optionId"))
public class SessionAnswerOption extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "answerId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAnswerOptionAnswer"))
    private SessionAnswer answer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "optionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAnswerOptionOption"))
    private AnswerOption option;

    // "rank" itself is a reserved word in MySQL 8 — hence rankOrder.
    @Column(name = "rankOrder")
    private Integer rankOrder;

    public SessionAnswer getAnswer() { return answer; }
    public void setAnswer(SessionAnswer answer) { this.answer = answer; }
    public AnswerOption getOption() { return option; }
    public void setOption(AnswerOption option) { this.option = option; }
    public Integer getRankOrder() { return rankOrder; }
    public void setRankOrder(Integer rankOrder) { this.rankOrder = rankOrder; }
}
