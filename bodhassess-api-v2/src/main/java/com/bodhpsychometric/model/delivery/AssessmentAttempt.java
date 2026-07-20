package com.bodhpsychometric.model.delivery;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.model.base.BaseEntity;

/**
 * One run of the assessment. RESUME = the live attempt continues with its
 * partial answers. RESET = admin stamps archivedAt here and the service
 * spawns attempt N+1 — this row and all its children stay intact forever
 * (the archive IS the row). At most one live (archivedAt IS NULL) attempt
 * per session — service invariant.
 *
 * Cap accounting: a session consumes allotment cap exactly while its live
 * attempt is COMPLETED.
 */
@Entity
@Table(name = "AssessmentAttempt",
        uniqueConstraints = @UniqueConstraint(name = "uqAttemptNumber",
                columnNames = {"sessionId", "attemptNumber"}))
public class AssessmentAttempt extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sessionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAttemptSession"))
    private AssessmentSession session;

    @Column(name = "attemptNumber", nullable = false)
    private int attemptNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private AttemptStatus status = AttemptStatus.NOT_STARTED;

    @Column(name = "startedAt")
    private OffsetDateTime startedAt;

    @Column(name = "completedAt")
    private OffsetDateTime completedAt;

    @Column(name = "archivedAt")
    private OffsetDateTime archivedAt;

    @OneToMany(mappedBy = "attempt", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SessionAnswer> answers = new ArrayList<>();

    @OneToMany(mappedBy = "attempt", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SessionTraitScore> traitScores = new ArrayList<>();

    @OneToMany(mappedBy = "attempt", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SessionDemographic> demographics = new ArrayList<>();

    public AssessmentSession getSession() { return session; }
    public void setSession(AssessmentSession session) { this.session = session; }
    public int getAttemptNumber() { return attemptNumber; }
    public void setAttemptNumber(int attemptNumber) { this.attemptNumber = attemptNumber; }
    public AttemptStatus getStatus() { return status; }
    public void setStatus(AttemptStatus status) { this.status = status; }
    public OffsetDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(OffsetDateTime startedAt) { this.startedAt = startedAt; }
    public OffsetDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
    public OffsetDateTime getArchivedAt() { return archivedAt; }
    public void setArchivedAt(OffsetDateTime archivedAt) { this.archivedAt = archivedAt; }
    public List<SessionAnswer> getAnswers() { return answers; }
    public void setAnswers(List<SessionAnswer> answers) { this.answers = answers; }
    public List<SessionTraitScore> getTraitScores() { return traitScores; }
    public void setTraitScores(List<SessionTraitScore> traitScores) { this.traitScores = traitScores; }
    public List<SessionDemographic> getDemographics() { return demographics; }
    public void setDemographics(List<SessionDemographic> demographics) { this.demographics = demographics; }

    public boolean isLive() { return archivedAt == null; }

    public void addAnswer(SessionAnswer answer) {
        answers.add(answer);
        answer.setAttempt(this);
    }

    public void addTraitScore(SessionTraitScore score) {
        traitScores.add(score);
        score.setAttempt(this);
    }

    public void addDemographic(SessionDemographic demographic) {
        demographics.add(demographic);
        demographic.setAttempt(this);
    }
}
