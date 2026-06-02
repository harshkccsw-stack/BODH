package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Lob;
import javax.persistence.Table;

/**
 * Opaque registration token issued by the invite / copy-link popup. The
 * token IS the primary key — generated as a cryptographically random
 * string. Carries the assessment context plus optional scoping:
 *
 *   - entityId set     → registrant joins this entity on submit
 *   - groupId set      → registrant joins this group on submit
 *   - respondentId set → token is pre-bound to a specific person (use for
 *                        targeted resends; on submit we attach to this
 *                        respondent rather than creating a new one)
 *
 * usedCount tracks consumption against maxUses. A typical individual
 * invite has maxUses=1; an entity/group-wide link can be higher or null
 * (unlimited).
 */
@Entity
@Table(name = "assessment_tokens")
public class AssessmentToken {

    // The opaque token string — also the PK. Generated with a strong RNG
    // by the service before persistence.
    @Id
    @Column(length = 64)
    private String token;

    @Column(name = "assessment_id", nullable = false, length = 64)
    private String assessmentId;

    @Column(name = "entity_id", length = 64)
    private String entityId;

    @Column(name = "group_id", length = 64)
    private String groupId;

    @Column(name = "respondent_id", length = 64)
    private String respondentId;

    @Column(name = "max_uses")
    private Integer maxUses;

    @Column(name = "used_count", nullable = false)
    private int usedCount = 0;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "created_by")
    private String createdBy;

    // PNG bytes of the QR code that encodes this token's registration link.
    // Generated lazily the first time the QR is requested and persisted so
    // it is produced exactly once (per the "generate once, save in DB"
    // requirement); later downloads just stream the stored bytes.
    @Lob
    @Column(name = "qr_code", columnDefinition = "LONGBLOB")
    private byte[] qrCode;

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }
    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }
    public String getRespondentId() { return respondentId; }
    public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
    public Integer getMaxUses() { return maxUses; }
    public void setMaxUses(Integer maxUses) { this.maxUses = maxUses; }
    public int getUsedCount() { return usedCount; }
    public void setUsedCount(int usedCount) { this.usedCount = usedCount; }
    public OffsetDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(OffsetDateTime expiresAt) { this.expiresAt = expiresAt; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public byte[] getQrCode() { return qrCode; }
    public void setQrCode(byte[] qrCode) { this.qrCode = qrCode; }
}
