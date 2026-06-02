package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

/**
 * First-class Assessment — a reusable allotment of a Questionnaire to a
 * set of Allotees (entities, groups, individual respondents). One row per
 * "Create Assessment" act. Sessions hang off this row via the
 * portal_sessions.assessment_id FK; the answers/scores live on the
 * sessions, never here.
 *
 * Status drives respondent-facing behavior:
 *   ACTIVE  — admin can allot more, respondents can take
 *   CLOSED  — no new allotments accepted, but in-progress sessions can finish
 *   PAUSED  — respondents currently in the assessment are blocked from taking
 */
@Entity
@Table(name = "assessments")
public class Assessment {

    @Id
    private String id;

    private String name;

    // FK to the Questionnaire PARENT (the questionnaire family — PHQ-9,
    // GAD-7, …). Persistent. The specific committed version this
    // assessment is pinned to lives in questionnaireVersionId — that's
    // what drives content shown to the respondent and how their answers
    // are scored.
    @Column(name = "questionnaire_id", nullable = false)
    private String questionnaireId;

    // FK to PublishedQuestionnaire (a committed version row). Set at
    // assessment-creation time and never changes. Lets the same
    // assessment family have versions evolve underneath without
    // retroactively altering in-flight respondents' content/scoring.
    @Column(name = "questionnaire_version_id", length = 64)
    private String questionnaireVersionId;

    // Cached display fields so the All Assessments list doesn't have to
    // join the questionnaire table for every row. Kept in sync at
    // Assessment-create time.
    @Column(name = "questionnaire_name")
    private String questionnaireName;

    private String vertical;

    private String language;

    // ACTIVE / CLOSED / PAUSED. Plain string instead of enum so adding a
    // new state doesn't require a migration.
    @Column(nullable = false, length = 16)
    private String status = "ACTIVE";

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "created_by")
    private String createdBy;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getQuestionnaireId() { return questionnaireId; }
    public void setQuestionnaireId(String questionnaireId) { this.questionnaireId = questionnaireId; }
    public String getQuestionnaireVersionId() { return questionnaireVersionId; }
    public void setQuestionnaireVersionId(String questionnaireVersionId) { this.questionnaireVersionId = questionnaireVersionId; }
    public String getQuestionnaireName() { return questionnaireName; }
    public void setQuestionnaireName(String questionnaireName) { this.questionnaireName = questionnaireName; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
