package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.IdClass;
import javax.persistence.Table;

/**
 * Join row mapping one Assessment to one Group. Groups fan out to all
 * their current members at session-creation time; no per-pair cap (only
 * Entity allotments carry caps per the design).
 */
@Entity
@Table(name = "assessment_group_allotments")
@IdClass(AssessmentGroupAllotmentId.class)
public class AssessmentGroupAllotment {

    @Id
    @Column(name = "assessment_id", length = 64)
    private String assessmentId;

    @Id
    @Column(name = "group_id", length = 64)
    private String groupId;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "created_by")
    private String createdBy;

    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
}
