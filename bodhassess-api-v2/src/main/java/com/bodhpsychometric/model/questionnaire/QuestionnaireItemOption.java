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
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import com.bodhpsychometric.model.taxonomy.*;
import com.bodhpsychometric.auth.base.BaseEntity;
import com.bodhpsychometric.model.item.AnswerOption;

/**
 * One row per option per usage: carries this questionnaire's displayOrder for
 * the option and hosts its option-level trait scores. Every option of the
 * usage's item must have exactly one row — a questionnaire can reorder
 * options but never hide them (service invariant). The option must belong to
 * the usage's item; Flyway hardens that with composite FKs at cutover, the
 * service validates it always.
 */
@Entity
@Table(name = "QuestionnaireItemOption",
        uniqueConstraints = @UniqueConstraint(name = "uqUsageOption",
                columnNames = {"questionnaireItemId", "optionId"}),
        indexes = @Index(name = "idxUsageOptionOption", columnList = "optionId"))
public class QuestionnaireItemOption extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireItemId", nullable = false,
            foreignKey = @ForeignKey(name = "fkUsageOptionUsage"))
    private QuestionnaireItem usage;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "optionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkUsageOptionOption"))
    private AnswerOption option;

    @Column(name = "displayOrder", nullable = false)
    private int displayOrder;

    @OneToMany(mappedBy = "optionUsage", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OptionUsageTraitScore> traitScores = new ArrayList<>();

    public QuestionnaireItem getUsage() { return usage; }
    public void setUsage(QuestionnaireItem usage) { this.usage = usage; }
    public AnswerOption getOption() { return option; }
    public void setOption(AnswerOption option) { this.option = option; }
    public int getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(int displayOrder) { this.displayOrder = displayOrder; }
    public List<OptionUsageTraitScore> getTraitScores() { return traitScores; }
    public void setTraitScores(List<OptionUsageTraitScore> traitScores) { this.traitScores = traitScores; }

    public void addTraitScore(OptionUsageTraitScore score) {
        traitScores.add(score);
        score.setOptionUsage(this);
    }

    public void removeTraitScore(OptionUsageTraitScore score) {
        traitScores.remove(score);
        score.setOptionUsage(null);
    }
}
