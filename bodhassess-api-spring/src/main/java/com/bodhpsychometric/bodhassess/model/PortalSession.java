package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import javax.persistence.CascadeType;
import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.OneToMany;
import javax.persistence.Table;

@Entity
@Table(name = "portal_sessions")
public class PortalSession {

    @Id
    private String id;

    // Stable group key shared by all sessions created in the same admin
    // bulk allotment. Lets the All Assessments page collapse N sessions
    // into one assessment row, and the /assessments/:id/respondents page
    // list the respondents that received this particular allotment.
    // Nullable for older rows created before this column existed.
    @Column(name = "assessment_id", length = 64)
    private String assessmentId;

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

    // Per-question responses live in the assessment_answers child table
    // (one row per question) instead of a JSON blob, so reports can join
    // and filter on individual answers. Cascade + orphanRemoval keep the
    // child rows in lockstep with the session lifecycle.
    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<AssessmentAnswer> answers = new ArrayList<>();

    // Per-MQT scoring result and demographic answers — both live in their
    // own child tables so reports can join/filter on individual rows.
    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PortalSessionMqtScore> mqtScores = new ArrayList<>();

    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PortalSessionDemographic> demographics = new ArrayList<>();

    @Column(name = "group_id")
    private String groupId;

    @Column(name = "group_name")
    private String groupName;

    // Entity scope: when the session was generated from an entity
    // allotment, this points at the entity. Drives per-(entity,
    // assessment) cap enforcement.
    @Column(name = "entity_id")
    private String entityId;

    @Column(name = "entity_name")
    private String entityName;

    @Column(name = "consent_id")
    private String consentId;

    private boolean proctoring;

    @Column(name = "invitation_sent")
    private boolean invitationSent;

    // Per-allotment override: when true the respondent sees a numbered side
    // panel during the assessment with attempted questions highlighted in
    // green. Off by default so existing sessions don't change behaviour.
    @Column(name = "show_question_index", nullable = false)
    private boolean showQuestionIndex = false;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    // Set when the respondent submits their first answer. Used for the
    // 24h/48h "not started" notifications and the time-to-start metric.
    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getAssessmentId() { return assessmentId; }
    public void setAssessmentId(String assessmentId) { this.assessmentId = assessmentId; }
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
    public List<AssessmentAnswer> getAnswers() { return answers; }
    public void setAnswers(List<AssessmentAnswer> answers) { this.answers = answers; }
    public List<PortalSessionMqtScore> getMqtScores() { return mqtScores; }
    public void setMqtScores(List<PortalSessionMqtScore> mqtScores) { this.mqtScores = mqtScores; }
    public List<PortalSessionDemographic> getDemographics() { return demographics; }
    public void setDemographics(List<PortalSessionDemographic> demographics) { this.demographics = demographics; }
    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }
    public String getGroupName() { return groupName; }
    public void setGroupName(String groupName) { this.groupName = groupName; }
    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }
    public String getEntityName() { return entityName; }
    public void setEntityName(String entityName) { this.entityName = entityName; }
    public String getConsentId() { return consentId; }
    public void setConsentId(String consentId) { this.consentId = consentId; }
    public boolean isProctoring() { return proctoring; }
    public void setProctoring(boolean proctoring) { this.proctoring = proctoring; }
    public boolean isInvitationSent() { return invitationSent; }
    public void setInvitationSent(boolean invitationSent) { this.invitationSent = invitationSent; }
    public boolean isShowQuestionIndex() { return showQuestionIndex; }
    public void setShowQuestionIndex(boolean showQuestionIndex) { this.showQuestionIndex = showQuestionIndex; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
    public OffsetDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(OffsetDateTime startedAt) { this.startedAt = startedAt; }
}
