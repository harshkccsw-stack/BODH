package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Table;

/**
 * Append-only audit trail for admin actions on Entity and Assessment.
 *
 *   action      — short stable code (ENTITY_ACTIVATED, ENTITY_CAP_CHANGED,
 *                 ASSESSMENT_CREATED, ASSESSMENT_PAUSED, ALLOTMENT_ADDED,
 *                 ALLOTMENT_REMOVED, MEMBER_LINKED, MEMBER_REMOVED, ...)
 *   targetType  — entity | assessment | entity_allotment | ...
 *   targetId    — id of the affected row
 *   before/after JSON — snapshots of changed fields (or empty for
 *                       creation/deletion events)
 */
@Entity
@Table(name = "audit_log")
public class AuditLogEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "actor_id")
    private String actorId;

    @Column(name = "actor_name")
    private String actorName;

    @Column(nullable = false, length = 64)
    private String action;

    @Column(name = "target_type", length = 64)
    private String targetType;

    @Column(name = "target_id", length = 128)
    private String targetId;

    @Column(name = "before_json", columnDefinition = "text")
    private String beforeJson;

    @Column(name = "after_json", columnDefinition = "text")
    private String afterJson;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    public Long getId() { return id; }
    public String getActorId() { return actorId; }
    public void setActorId(String actorId) { this.actorId = actorId; }
    public String getActorName() { return actorName; }
    public void setActorName(String actorName) { this.actorName = actorName; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }
    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }
    public String getBeforeJson() { return beforeJson; }
    public void setBeforeJson(String beforeJson) { this.beforeJson = beforeJson; }
    public String getAfterJson() { return afterJson; }
    public void setAfterJson(String afterJson) { this.afterJson = afterJson; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
