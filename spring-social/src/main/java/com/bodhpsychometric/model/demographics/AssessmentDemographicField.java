package com.bodhpsychometric.model.demographics;

import com.bodhpsychometric.model.assessment.Assessment;

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
 * Mapping edge: this demographic field appears on this assessment's form.
 * The student's form is exactly these rows for the assessment, sorted by
 * sortOrder. Required lives here, not on the field, because the same field
 * can be mandatory in one assessment and optional in another. The unique
 * pair stops a field being attached to an assessment twice.
 */
@Entity
@Table(name = "AssessmentDemographicField",
        uniqueConstraints = @UniqueConstraint(name = "uqAdfAssessmentField",
                columnNames = {"assessmentId", "demographicFieldId"}),
        indexes = @Index(name = "idxAdfField", columnList = "demographicFieldId"))
public class AssessmentDemographicField implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long assessmentDemographicFieldId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assessmentId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAdfAssessment"))
    private Assessment assessment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "demographicFieldId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAdfField"))
    private DemographicField demographicField;

    @Column(name = "isRequired", nullable = false)
    private boolean required;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public Long getAssessmentDemographicFieldId() {
        return assessmentDemographicFieldId;
    }

    public void setAssessmentDemographicFieldId(Long assessmentDemographicFieldId) {
        this.assessmentDemographicFieldId = assessmentDemographicFieldId;
    }

    public Assessment getAssessment() {
        return assessment;
    }

    public void setAssessment(Assessment assessment) {
        this.assessment = assessment;
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
