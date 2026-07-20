package com.bodhpsychometric.bodhassess.domain.people;

import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.bodhassess.domain.base.BaseEntity;

/**
 * RBAC role. Seeded: admin, practitioner, respondent. Access is a path
 * allow-list (kept from the old permission model) split by matcher: API
 * patterns gate requests server-side, PAGE patterns gate dashboard routes in
 * the frontend. Deleting a role in use is blocked by the UserRole FK
 * (RESTRICT).
 */
@Entity
@Table(name = "Role",
        uniqueConstraints = @UniqueConstraint(name = "uqRoleName", columnNames = "name"))
public class Role extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "RoleUrlPath",
            joinColumns = @JoinColumn(name = "roleId",
                    foreignKey = @ForeignKey(name = "fkRoleUrlPathRole")))
    private Set<RolePath> paths = new HashSet<>();

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Set<RolePath> getPaths() { return paths; }
    public void setPaths(Set<RolePath> paths) { this.paths = paths; }

    /** Request-URI patterns — the only ones that actually grant data access. */
    public Set<String> apiPaths() { return pathsOf(RolePathKind.API); }

    /** Dashboard route patterns the frontend uses to trim navigation. */
    public Set<String> pagePaths() { return pathsOf(RolePathKind.PAGE); }

    private Set<String> pathsOf(RolePathKind kind) {
        Set<String> matching = new LinkedHashSet<>();
        for (RolePath candidate : paths) {
            if (candidate.getKind() == kind) {
                matching.add(candidate.getPath());
            }
        }
        return matching;
    }
}
