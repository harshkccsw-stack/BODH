package com.bodhpsychometric.auth;

import java.util.HashSet;
import java.util.Set;

import com.bodhpsychometric.auth.base.BaseEntity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * One area of the dashboard, named and expressed as the frontend routes it
 * covers — "Assessments" is /assessments/*, "Question Bank" is
 * /question-bank/*. Roles are the reusable pieces; people are never given a
 * Role directly, they are given a RoleGroup that contains it.
 *
 * Paths are rows (RoleUrlPath), not a delimited string, so they can be
 * constrained and queried, and a duplicate path is impossible.
 *
 * These are the routes the frontend guards. The API is not gated by them
 * today — a valid token can still reach any endpoint — so treat this as
 * navigation control, not a security boundary, until the API side lands.
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
    @Column(name = "urlPath", nullable = false, length = 255)
    private Set<String> urlPaths = new HashSet<>();

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Set<String> getUrlPaths() { return urlPaths; }
    public void setUrlPaths(Set<String> urlPaths) { this.urlPaths = urlPaths; }
}
