package com.bodhpsychometric.bodhassess.domain.delivery;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.bodhassess.domain.base.BaseEntity;
import com.bodhpsychometric.bodhassess.domain.item.Item;

/**
 * One answer to one question within an attempt. Anchored to the IMMUTABLE
 * Item — never the questionnaire usage edge — so authors can freely edit
 * questionnaires later without touching history. Option selections live in
 * child rows; freeText serves FREE_TEXT items.
 */
@Entity
@Table(name = "SessionAnswer",
        uniqueConstraints = @UniqueConstraint(name = "uqAnswerAttemptItem",
                columnNames = {"attemptId", "itemId"}),
        indexes = @Index(name = "idxAnswerItem", columnList = "itemId"))
public class SessionAnswer extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "attemptId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAnswerAttempt"))
    private AssessmentAttempt attempt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "itemId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAnswerItem"))
    private Item item;

    @Column(name = "freeText", columnDefinition = "TEXT")
    private String freeText;

    @OneToMany(mappedBy = "answer", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SessionAnswerOption> selectedOptions = new ArrayList<>();

    public AssessmentAttempt getAttempt() { return attempt; }
    public void setAttempt(AssessmentAttempt attempt) { this.attempt = attempt; }
    public Item getItem() { return item; }
    public void setItem(Item item) { this.item = item; }
    public String getFreeText() { return freeText; }
    public void setFreeText(String freeText) { this.freeText = freeText; }
    public List<SessionAnswerOption> getSelectedOptions() { return selectedOptions; }
    public void setSelectedOptions(List<SessionAnswerOption> selectedOptions) { this.selectedOptions = selectedOptions; }

    public void addSelectedOption(SessionAnswerOption option) {
        selectedOptions.add(option);
        option.setAnswer(this);
    }

    public void removeSelectedOption(SessionAnswerOption option) {
        selectedOptions.remove(option);
        option.setAnswer(null);
    }
}
