package com.bodhpsychometric.model.demographics;

import com.bodhpsychometric.model.questionnaire.Questionnaire;

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
 * Mapping edge: this demographic field appears on this questionnaire's form.
 * The respondent-facing form is exactly these rows for the assessment's
 * questionnaire, sorted by sortOrder. Required lives here, not on the field,
 * because the same field can be mandatory in one questionnaire and optional
 * in another. The unique pair stops a field being attached twice.
 */
@Entity
@Table(name = "QuestionnaireDemographicField",
        uniqueConstraints = @UniqueConstraint(name = "uqQdfQuestionnaireField",
                columnNames = {"questionnaireId", "demographicFieldId"}),
        indexes = @Index(name = "idxQdfField", columnList = "demographicFieldId"))
public class QuestionnaireDemographicField implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long questionnaireDemographicFieldId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionnaireId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQdfQuestionnaire"))
    private Questionnaire questionnaire;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "demographicFieldId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQdfField"))
    private DemographicField demographicField;

    @Column(name = "isRequired", nullable = false)
    private boolean required;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public Long getQuestionnaireDemographicFieldId() {
        return questionnaireDemographicFieldId;
    }

    public void setQuestionnaireDemographicFieldId(Long questionnaireDemographicFieldId) {
        this.questionnaireDemographicFieldId = questionnaireDemographicFieldId;
    }

    public Questionnaire getQuestionnaire() {
        return questionnaire;
    }

    public void setQuestionnaire(Questionnaire questionnaire) {
        this.questionnaire = questionnaire;
    }

    public DemographicField getDemographicField() {
        return demographicField;
    }

    public void setDemographicField(DemographicField demographicField) {
        this.demographicField = demographicField;
    }

    public boolean isRequired() {
        return required;
    }

    public void setRequired(boolean required) {
        this.required = required;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
