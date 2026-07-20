package com.bodhpsychometric.bodhassess.domain.auth.unnecessary;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.bodhpsychometric.bodhassess.domain.auth.User;
import com.bodhpsychometric.bodhassess.domain.base.BaseEntity;

/**
 * Temporal org membership: createdAt = joined, removedAt = left; re-joining
 * creates a fresh row, so the full history survives and the user's own data
 * is never touched. Deliberately NO unique(org, user) — history rows share
 * the pair; the service keeps at most one ACTIVE (removedAt IS NULL) row per
 * pair. Independent of group membership.
 */
@Entity
@Table(name = "OrganizationMember",
        indexes = {
                @Index(name = "idxOrgMemberOrg", columnList = "organizationId"),
                @Index(name = "idxOrgMemberUser", columnList = "userId")
        })
public class OrganizationMember extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organizationId", nullable = false,
            foreignKey = @ForeignKey(name = "fkOrgMemberOrg"))
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "userId", nullable = false,
            foreignKey = @ForeignKey(name = "fkOrgMemberUser"))
    private User user;

    @Column(name = "removedAt")
    private OffsetDateTime removedAt;

    public Organization getOrganization() { return organization; }
    public void setOrganization(Organization organization) { this.organization = organization; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public OffsetDateTime getRemovedAt() { return removedAt; }
    public void setRemovedAt(OffsetDateTime removedAt) { this.removedAt = removedAt; }

    public boolean isActive() { return removedAt == null; }
}
