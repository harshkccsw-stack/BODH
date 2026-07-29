package com.bodhpsychometric.model.questionnaire;

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
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.model.base.BaseEntity;
import com.bodhpsychometric.model.item.Item;

/**
 * The usage edge — which item, where in the questionnaire, and what it means
 * here. All trait scoring and per-questionnaire option order hang off this
 * row, so the same immutable item contributes differently per questionnaire.
 * Removing a question deletes this row (and its children) only; the item
 * stays in the bank.
 *
 * Service invariants: every AnswerOption of the item has exactly one
 * optionUsage row (no hiding), and a copy-on-write repoint migrates the
 * children to the new item's options.
 */
@Entity
@Table(name = "QuestionnaireItem",
        uniqueConstraints = @UniqueConstraint(name = "uqQuestionnaireItem",
                columnNames = {"questionnaireId", "itemId"}),
        indexes = {
                @Index(name = "idxQuestionnaireItemQuestionnaire", columnList = "questionnaireId"),
                @Index(name = "idxQuestionnaireItemItem", columnList = "itemId"),
                @Index(name = "idxQuestionnaireItemSection", columnList = "sectionId")
        })
public class QuestionnaireItem extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQuestionnaireItemQuestionnaire"))
    private Questionnaire questionnaire;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "itemId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQuestionnaireItemItem"))
    private Item item;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sectionId",
            foreignKey = @ForeignKey(name = "fkQuestionnaireItemSection"))
    private QuestionnaireSection section;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    @OneToMany(mappedBy = "usage", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ItemUsageTraitScore> traitScores = new ArrayList<>();

    @OneToMany(mappedBy = "usage", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("displayOrder ASC")
    private List<QuestionnaireItemOption> optionUsages = new ArrayList<>();

    public Questionnaire getQuestionnaire() { return questionnaire; }
    public void setQuestionnaire(Questionnaire questionnaire) { this.questionnaire = questionnaire; }
    public Item getItem() { return item; }
    public void setItem(Item item) { this.item = item; }
    public QuestionnaireSection getSection() { return section; }
    public void setSection(QuestionnaireSection section) { this.section = section; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public List<ItemUsageTraitScore> getTraitScores() { return traitScores; }
    public void setTraitScores(List<ItemUsageTraitScore> traitScores) { this.traitScores = traitScores; }
    public List<QuestionnaireItemOption> getOptionUsages() { return optionUsages; }
    public void setOptionUsages(List<QuestionnaireItemOption> optionUsages) { this.optionUsages = optionUsages; }

    public void addTraitScore(ItemUsageTraitScore score) {
        traitScores.add(score);
        score.setUsage(this);
    }

    public void removeTraitScore(ItemUsageTraitScore score) {
        traitScores.remove(score);
        score.setUsage(null);
    }

    public void addOptionUsage(QuestionnaireItemOption optionUsage) {
        optionUsages.add(optionUsage);
        optionUsage.setUsage(this);
    }

    public void removeOptionUsage(QuestionnaireItemOption optionUsage) {
        optionUsages.remove(optionUsage);
        optionUsage.setUsage(null);
    }
}
