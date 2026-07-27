package com.bodhpsychometric.model.demographics;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.auth.RespondentUser;

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
 * What the respondent entered for one demographic field of one assessment.
 * Parent is the (respondent, assessment) pair — same rule as AssessmentAnswer
 * — so one respondent holds one demographic set per assessment. Which fields
 * are asked comes from the assessment's questionnaire
 * (QuestionnaireDemographicField); the service must check the field is
 * actually mapped there, since the schema cannot express it. Unanswered
 * optional fields simply have no row; the unique tuple makes re-entry a
 * replace.
 *
 * The value is stored as text for every field type; NUMBER and DATE are
 * validated and parsed by the service against the field's type.
 */
@Entity
@Table(name = "DemographicResponse",
        uniqueConstraints = @UniqueConstraint(name = "uqDrRespondentAssessmentField",
                columnNames = {"respondentUserId", "assessmentId", "demographicFieldId"}),
        indexes = {
                @Index(name = "idxDrAssessment", columnList = "assessmentId"),
                @Index(name = "idxDrField", columnList = "demographicFieldId")
        })
public class DemographicResponse implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long demographicResponseId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "respondentUserId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDrRespondent"))
    private RespondentUser respondent;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assessmentId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDrAssessment"))
    private Assessment assessment;

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

    public RespondentUser getRespondent() {
        return respondent;
    }

    public void setRespondent(RespondentUser respondent) {
        this.respondent = respondent;
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

    public String getResponseValue() {
        return responseValue;
    }

    public void setResponseValue(String responseValue) {
        this.responseValue = responseValue;
    }
}
