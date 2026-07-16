package com.bodhpsychometric.bodhassess.domain.people;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.bodhassess.domain.base.BaseEntity;

/** M:N user ↔ role assignment. */
@Entity
@Table(name = "UserRole",
        uniqueConstraints = @UniqueConstraint(name = "uqUserRole",
                columnNames = {"userId", "roleId"}),
        indexes = @Index(name = "idxUserRoleRole", columnList = "roleId"))
public class UserRole extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "userId", nullable = false,
            foreignKey = @ForeignKey(name = "fkUserRoleUser"))
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "roleId", nullable = false,
            foreignKey = @ForeignKey(name = "fkUserRoleRole"))
    private Role role;

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }
}
