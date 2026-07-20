package com.bodhpsychometric.model.questionnaire;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.model.assessment.DemographicField;
import com.bodhpsychometric.model.base.BaseEntity;

/**
 * Which demographic fields this questionnaire's registration form shows, in
 * what order. Replaces the published-snapshot field_key string set.
 */
@Entity
@Table(name = "QuestionnaireDemographicField",
        uniqueConstraints = @UniqueConstraint(name = "uqQuestionnaireField",
                columnNames = {"questionnaireId", "fieldId"}),
        indexes = @Index(name = "idxQuestionnaireFieldField", columnList = "fieldId"))
public class QuestionnaireDemographicField extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQuestionnaireFieldQuestionnaire"))
    private Questionnaire questionnaire;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "fieldId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQuestionnaireFieldField"))
    private DemographicField field;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public Questionnaire getQuestionnaire() { return questionnaire; }
    public void setQuestionnaire(Questionnaire questionnaire) { this.questionnaire = questionnaire; }
    public DemographicField getField() { return field; }
    public void setField(DemographicField field) { this.field = field; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
}
