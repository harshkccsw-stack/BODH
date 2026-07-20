package com.bodhpsychometric.bodhassess.domain.assessment;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.auth.User;
import com.bodhpsychometric.auth.base.BaseEntity;

/**
 * Direct individual eligibility — one row, no cap. Retake/reset mechanics
 * live on the session's attempts, not here.
 */
@Entity
@Table(name = "AssessmentRespondentAllotment",
        uniqueConstraints = @UniqueConstraint(name = "uqAllotAssessmentUser",
                columnNames = {"assessmentId", "userId"}),
        indexes = @Index(name = "idxAllotUserUser", columnList = "userId"))
public class AssessmentRespondentAllotment extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assessmentId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAllotUserAssessment"))
    private Assessment assessment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "userId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAllotUserUser"))
    private User user;

    public Assessment getAssessment() { return assessment; }
    public void setAssessment(Assessment assessment) { this.assessment = assessment; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
}
