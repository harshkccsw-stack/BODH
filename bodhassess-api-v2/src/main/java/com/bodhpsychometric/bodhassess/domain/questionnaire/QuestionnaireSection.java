package com.bodhpsychometric.bodhassess.domain.questionnaire;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.bodhpsychometric.bodhassess.domain.base.BaseEntity;

/**
 * A titled group of questions. A questionnaire "has sections" simply when
 * these rows exist; unsectioned questionnaires have none and their usage rows
 * carry section = null. Deleting a section drops its questions back to
 * unsectioned (service reassigns) — it never removes them from the
 * questionnaire.
 */
@Entity
@Table(name = "QuestionnaireSection",
        indexes = @Index(name = "idxSectionQuestionnaire", columnList = "questionnaireId"))
public class QuestionnaireSection extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireId", nullable = false,
            foreignKey = @ForeignKey(name = "fkSectionQuestionnaire"))
    private Questionnaire questionnaire;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public Questionnaire getQuestionnaire() { return questionnaire; }
    public void setQuestionnaire(Questionnaire questionnaire) { this.questionnaire = questionnaire; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
}
