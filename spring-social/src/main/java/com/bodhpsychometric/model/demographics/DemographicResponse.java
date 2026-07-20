package com.bodhpsychometric.model.demographics;

import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;

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
 * What the respondent entered for one demographic field of one attempt.
 * Parent is the {@link RespondentAssessmentMapping} — same rule as
 * AssessmentAnswer — so responses are per attempt and can never disagree
 * with the allotment about who was answering. Unanswered optional fields
 * simply have no row; the unique pair makes re-entry an update.
 *
 * The value is stored as text for every field type; NUMBER and DATE are
 * validated and parsed by the service against the field's type. The service
 * must also check the field is actually mapped to the attempt's assessment
 * via AssessmentDemographicField — the schema cannot express that.
 */
@Entity
@Table(name = "DemographicResponse",
        uniqueConstraints = @UniqueConstraint(name = "uqDrMappingField",
                columnNames = {"respondentAssessmentMappingId", "demographicFieldId"}),
        indexes = @Index(name = "idxDrField", columnList = "demographicFieldId"))
public class DemographicResponse implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long demographicResponseId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "respondentAssessmentMappingId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDrMapping"))
    private RespondentAssessmentMapping mapping;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "demographicFieldId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDrField"))
    private DemographicField demographicField;

    @Column(name = "responseValue", nullable = false, columnDefinition = "TEXT")
    private String responseValue;

    public Long getDemographicResponseId() {
        return demographicResponseId;
    }

    public void setDemographicResponseId(Long demographicResponseId) {
        this.demographicResponseId = demographicResponseId;
    }

    public RespondentAssessmentMapping getMapping() {
        return mapping;
    }

    public void setMapping(RespondentAssessmentMapping mapping) {
        this.mapping = mapping;
    }

    public DemographicField getDemographicField() {
        return demographicField;
    }

    public void setDemographicField(DemographicField demographicField) {
        this.demographicField = demographicField;
    }

    public String getResponseValue() {
        return responseValue;
    }

    public void setResponseValue(String responseValue) {
        this.responseValue = responseValue;
    }
}
