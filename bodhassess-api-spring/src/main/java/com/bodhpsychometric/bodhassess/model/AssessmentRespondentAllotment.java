package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.IdClass;
import javax.persistence.Table;

/**
 * Join row mapping one Assessment directly to an individual Respondent
 * (allotment outside of any entity or group). Allotting an individual is
 * a separate action from inviting — admin allots first, then invites via
 * the popup. No cap (one row = one respondent's eligibility).
 */
@Entity
@Table(name = "assessment_respondent_allotments")
@IdClass(AssessmentRespondentAllotmentId.class)
public class AssessmentRespondentAllotment {

    @Id
    @Column(name = "assessment_id", length = 64)
    private String assessmentId;

    @Id
    @Column(name = "respondent_id", length = 64)
    private String respondentId;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "created_by")
    private String createdBy;

    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getRespondentId() { return respondentId; }
    public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
}
