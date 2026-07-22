package com.bodhpsychometric.model.questionnaire;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.bodhpsychometric.model.base.BaseEntity;

/**
 * Append-only trail replacing questionnaire versioning: one row per change.
 * The actor and moment are the inherited createdBy/createdAt (filled by
 * auditing); details holds a JSON before/after payload. Rows are never
 * updated or deleted.
 */
@Entity
@Table(name = "QuestionnaireChangeLog",
        indexes = @Index(name = "idxChangeLogQuestionnaire", columnList = "questionnaireId"))
public class QuestionnaireChangeLog extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireId", nullable = false,
            foreignKey = @ForeignKey(name = "fkChangeLogQuestionnaire"))
    private Questionnaire questionnaire;

    @Enumerated(EnumType.STRING)
    @Column(name = "changeType", nullable = false, length = 40)
    private QuestionnaireChangeType changeType;

    @Column(name = "details", columnDefinition = "TEXT")
    private String details;

    public Questionnaire getQuestionnaire() { return questionnaire; }
    public void setQuestionnaire(Questionnaire questionnaire) { this.questionnaire = questionnaire; }
    public QuestionnaireChangeType getChangeType() { return changeType; }
    public void setChangeType(QuestionnaireChangeType changeType) { this.changeType = changeType; }
    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }
}
