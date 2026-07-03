package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

@Entity
@Table(name = "sessions")
public class Session {

    @Id
    @Column(columnDefinition = "char(36)")
    private String id;

    @Column(name = "tenant_id", columnDefinition = "char(36)")
    private String tenantId;

    @Column(name = "practitioner_id", columnDefinition = "char(36)")
    private String practitionerId;

    @Column(name = "respondent_id", columnDefinition = "char(36)")
    private String respondentId;

    @Column(name = "instrument_id", columnDefinition = "char(36)")
    private String instrumentId;

    @Column(name = "consent_id", columnDefinition = "char(36)")
    private String consentId;

    private String vertical;

    private String language;

    private String status;

    @Column(name = "is_proctored")
    private boolean isProctored;

    @Column(name = "trust_score")
    private Double trustScore;

    @Column(name = "theta_estimate")
    private double thetaEstimate;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getPractitionerId() { return practitionerId; }
    public void setPractitionerId(String practitionerId) { this.practitionerId = practitionerId; }
    public String getRespondentId() { return respondentId; }
    public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
    public String getInstrumentId() { return instrumentId; }
    public void setInstrumentId(String instrumentId) { this.instrumentId = instrumentId; }
    public String getConsentId() { return consentId; }
    public void setConsentId(String consentId) { this.consentId = consentId; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public boolean isProctored() { return isProctored; }
    public void setProctored(boolean proctored) { isProctored = proctored; }
    public Double getTrustScore() { return trustScore; }
    public void setTrustScore(Double trustScore) { this.trustScore = trustScore; }
    public double getThetaEstimate() { return thetaEstimate; }
    public void setThetaEstimate(double thetaEstimate) { this.thetaEstimate = thetaEstimate; }
    public OffsetDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(OffsetDateTime startedAt) { this.startedAt = startedAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
