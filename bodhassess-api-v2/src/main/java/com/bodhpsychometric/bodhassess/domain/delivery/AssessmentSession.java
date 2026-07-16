package com.bodhpsychometric.bodhassess.domain.delivery;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import com.bodhpsychometric.bodhassess.domain.assessment.Assessment;
import com.bodhpsychometric.bodhassess.domain.base.SoftDeletableEntity;
import com.bodhpsychometric.bodhassess.domain.people.Organization;
import com.bodhpsychometric.bodhassess.domain.people.RespondentGroup;
import com.bodhpsychometric.bodhassess.domain.people.User;

/**
 * One respondent's engagement with one assessment (was portal_sessions).
 * organization/group record which allotment door the session came through —
 * that scope drives cap accounting. Answers, scores, and demographics hang
 * off attempts, not the session: an admin RESET archives the live attempt and
 * spawns the next, so nothing is ever wiped. Recycle-bin only.
 *
 * The retained flags mirror the old product behavior: consentId is the
 * opaque id of the consent text the portal showed (no backend table — kept
 * as-is per product call); proctoring and showQuestionIndex are portal UX
 * switches; invitationSent is set by the invite flow.
 */
@Entity
@Table(name = "AssessmentSession",
        indexes = {
                @Index(name = "idxSessionAssessment", columnList = "assessmentId"),
                @Index(name = "idxSessionUser", columnList = "userId"),
                @Index(name = "idxSessionOrganization", columnList = "organizationId"),
                @Index(name = "idxSessionGroup", columnList = "groupId")
        })
public class AssessmentSession extends SoftDeletableEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assessmentId", nullable = false,
            foreignKey = @ForeignKey(name = "fkSessionAssessment"))
    private Assessment assessment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "userId", nullable = false,
            foreignKey = @ForeignKey(name = "fkSessionUser"))
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organizationId",
            foreignKey = @ForeignKey(name = "fkSessionOrganization"))
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "groupId",
            foreignKey = @ForeignKey(name = "fkSessionGroup"))
    private RespondentGroup group;

    @Column(name = "language", length = 8)
    private String language;

    @Column(name = "name", length = 200)
    private String name;

    @Column(name = "consentId", length = 64)
    private String consentId;

    @Column(name = "proctoring", nullable = false)
    private boolean proctoring;

    @Column(name = "invitationSent", nullable = false)
    private boolean invitationSent;

    @Column(name = "showQuestionIndex", nullable = false)
    private boolean showQuestionIndex;

    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("attemptNumber ASC")
    private List<AssessmentAttempt> attempts = new ArrayList<>();

    public Assessment getAssessment() { return assessment; }
    public void setAssessment(Assessment assessment) { this.assessment = assessment; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Organization getOrganization() { return organization; }
    public void setOrganization(Organization organization) { this.organization = organization; }
    public RespondentGroup getGroup() { return group; }
    public void setGroup(RespondentGroup group) { this.group = group; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getConsentId() { return consentId; }
    public void setConsentId(String consentId) { this.consentId = consentId; }
    public boolean isProctoring() { return proctoring; }
    public void setProctoring(boolean proctoring) { this.proctoring = proctoring; }
    public boolean isInvitationSent() { return invitationSent; }
    public void setInvitationSent(boolean invitationSent) { this.invitationSent = invitationSent; }
    public boolean isShowQuestionIndex() { return showQuestionIndex; }
    public void setShowQuestionIndex(boolean showQuestionIndex) { this.showQuestionIndex = showQuestionIndex; }
    public List<AssessmentAttempt> getAttempts() { return attempts; }
    public void setAttempts(List<AssessmentAttempt> attempts) { this.attempts = attempts; }

    public void addAttempt(AssessmentAttempt attempt) {
        attempts.add(attempt);
        attempt.setSession(this);
    }

    /** The attempt currently in play — the one with no archivedAt stamp. */
    public AssessmentAttempt getLiveAttempt() {
        for (AssessmentAttempt a : attempts) {
            if (a.getArchivedAt() == null) return a;
        }
        return null;
    }
}
