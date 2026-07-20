package com.bodhpsychometric.auth;

import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;

import com.bodhpsychometric.auth.base.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * A named bundle of Roles — "Practitioner", "Platform Admin" — and the only
 * thing handed to a user. A user holds exactly one group, so their access is
 * the union of the paths of the roles inside it; there are no deny rules and
 * no precedence to resolve.
 *
 * Many-to-many to Role on purpose: "Reports" belongs to several bundles at
 * once, and duplicating it per bundle would let the copies drift apart.
 */
@Entity
@Table(name = "RoleGroup",
        uniqueConstraints = @UniqueConstraint(name = "uqRoleGroupName", columnNames = "name"))
public class RoleGroup extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @Column(name ="name", nullable = false, length = 50)
    private String name;

    @Column(name ="description", columnDefinition = "TEXT")
    private String description;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "RoleGroupRole",
            joinColumns = @JoinColumn(name = "roleGroupId",
                    foreignKey = @ForeignKey(name = "fkRoleGroupRoleGroup")),
            inverseJoinColumns = @JoinColumn(name = "roleId",
                    foreignKey = @ForeignKey(name = "fkRoleGroupRoleRole")))
    private Set<Role> roles = new HashSet<>();

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Set<Role> getRoles() { return roles; }
    public void setRoles(Set<Role> roles) { this.roles = roles; }

    public void addRole(Role role) { roles.add(role); }
    public void removeRole(Role role) { roles.remove(role); }

    /**
     * Everything this group can open — the union the frontend matches the
     * current pathname against. Built here so "what may this user see" has a
     * single answer, wherever it is asked from.
     */
    public Set<String> allUrlPaths() {
        Set<String> merged = new LinkedHashSet<>();
        for (Role role : roles) {
            merged.addAll(role.getUrlPaths());
        }
        return merged;
    }
}
