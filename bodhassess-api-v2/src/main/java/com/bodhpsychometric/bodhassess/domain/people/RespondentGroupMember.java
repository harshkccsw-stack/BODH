package com.bodhpsychometric.bodhassess.domain.people;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.bodhpsychometric.bodhassess.domain.base.BaseEntity;

/**
 * Temporal group membership — same pattern as {@link OrganizationMember}:
 * history rows keep the pair, at most one active row per pair (service).
 */
@Entity
@Table(name = "RespondentGroupMember",
        indexes = {
                @Index(name = "idxGroupMemberGroup", columnList = "groupId"),
                @Index(name = "idxGroupMemberUser", columnList = "userId")
        })
public class RespondentGroupMember extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "groupId", nullable = false,
            foreignKey = @ForeignKey(name = "fkGroupMemberGroup"))
    private RespondentGroup group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "userId", nullable = false,
            foreignKey = @ForeignKey(name = "fkGroupMemberUser"))
    private User user;

    @Column(name = "removedAt")
    private OffsetDateTime removedAt;

    public RespondentGroup getGroup() { return group; }
    public void setGroup(RespondentGroup group) { this.group = group; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public OffsetDateTime getRemovedAt() { return removedAt; }
    public void setRemovedAt(OffsetDateTime removedAt) { this.removedAt = removedAt; }

    public boolean isActive() { return removedAt == null; }
}
