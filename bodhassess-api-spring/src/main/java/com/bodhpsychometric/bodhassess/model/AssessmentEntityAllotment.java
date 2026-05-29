package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.IdClass;
import javax.persistence.Table;

/**
 * Join row mapping one Assessment to one Entity, carrying the per-pair
 * cap. The cap is the maximum number of respondent sessions allowed for
 * this (assessment, entity) tuple — when count(sessions WHERE
 * assessmentId=A AND entityId=E) reaches it, new session creation is
 * refused.
 */
@Entity
@Table(name = "assessment_entity_allotments")
@IdClass(AssessmentEntityAllotmentId.class)
public class AssessmentEntityAllotment {

    @Id
    @Column(name = "assessment_id", length = 64)
    private String assessmentId;

    @Id
    @Column(name = "entity_id", length = 64)
    private String entityId;

    // Per-pair cap. Null = unlimited (rare for entities; admin usually
    // sets one explicitly at allotment time).
    @Column(name = "cap")
    private Integer cap;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "created_by")
    private String createdBy;

    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }
    public Integer getCap() { return cap; }
    public void setCap(Integer cap) { this.cap = cap; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
}
