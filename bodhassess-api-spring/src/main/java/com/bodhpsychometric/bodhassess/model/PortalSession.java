package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;

import com.vladmihalcea.hibernate.type.json.JsonStringType;

@Entity
@Table(name = "portal_sessions")
@TypeDef(name = "json", typeClass = JsonStringType.class)
public class PortalSession {

    @Id
    private String id;

    private String name;

    @Column(name = "respondent_id")
    private String respondentId;

    @Column(name = "respondent_name")
    private String respondentName;

    @Column(name = "respondent_email")
    private String respondentEmail;

    private String instrument;

    @Column(name = "instrument_full_name")
    private String instrumentFullName;

    private String vertical;

    private String language;

    private String status;

    private String score;

    @Type(type = "json")
    @Column(name = "answers", columnDefinition = "json")
    private Map<String, Object> answers = new HashMap<>();

    // Per-MQT scoring result. Kept opaque so the frontend can store either
    // legacy `{ [name]: total }` rows or the current
    // `{ [mqt_id]: { name, score } }` shape without backend churn.
    @Type(type = "json")
    @Column(name = "mqt_scores", columnDefinition = "json")
    private Map<String, Object> mqtScores = new HashMap<>();

    @Type(type = "json")
    @Column(name = "demographics", columnDefinition = "json")
    private Map<String, Object> demographics = new HashMap<>();

    @Column(name = "group_id")
    private String groupId;

    @Column(name = "group_name")
    private String groupName;

    @Column(name = "consent_id")
    private String consentId;

    private boolean proctoring;

    @Column(name = "invitation_sent")
    private boolean invitationSent;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getRespondentId() { return respondentId; }
    public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
    public String getRespondentName() { return respondentName; }
    public void setRespondentName(String respondentName) { this.respondentName = respondentName; }
    public String getRespondentEmail() { return respondentEmail; }
    public void setRespondentEmail(String respondentEmail) { this.respondentEmail = respondentEmail; }
    public String getInstrument() { return instrument; }
    public void setInstrument(String instrument) { this.instrument = instrument; }
    public String getInstrumentFullName() { return instrumentFullName; }
    public void setInstrumentFullName(String instrumentFullName) { this.instrumentFullName = instrumentFullName; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getScore() { return score; }
    public void setScore(String score) { this.score = score; }
    public Map<String, Object> getAnswers() { return answers; }
    public void setAnswers(Map<String, Object> answers) { this.answers = answers; }
    public Map<String, Object> getMqtScores() { return mqtScores; }
    public void setMqtScores(Map<String, Object> mqtScores) { this.mqtScores = mqtScores; }
    public Map<String, Object> getDemographics() { return demographics; }
    public void setDemographics(Map<String, Object> demographics) { this.demographics = demographics; }
    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }
    public String getGroupName() { return groupName; }
    public void setGroupName(String groupName) { this.groupName = groupName; }
    public String getConsentId() { return consentId; }
    public void setConsentId(String consentId) { this.consentId = consentId; }
    public boolean isProctoring() { return proctoring; }
    public void setProctoring(boolean proctoring) { this.proctoring = proctoring; }
    public boolean isInvitationSent() { return invitationSent; }
    public void setInvitationSent(boolean invitationSent) { this.invitationSent = invitationSent; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
}
