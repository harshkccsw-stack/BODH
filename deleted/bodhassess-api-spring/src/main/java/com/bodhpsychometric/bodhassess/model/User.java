package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;

import javax.persistence.CollectionTable;
import javax.persistence.Column;
import javax.persistence.ElementCollection;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.Table;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * The single identity / credentials record. Every login — dashboard or
 * assessment portal — resolves against this table.
 *
 *   - {@code email} is the canonical login identifier (unique).
 *   - {@code dob} is the permanent credential ("password").
 *   - {@code superAdmin} is god mode: it overrides all role/permission
 *     checks. It deliberately sits *above* the (future) role system as a
 *     plain boolean so it survives the later RBAC build untouched.
 *
 * Mapped to {@code app_users} (not {@code users}) to avoid colliding with a
 * legacy unmapped {@code users} table that predates this model.
 *
 * Roles / role-groups are intentionally NOT modelled yet — they arrive in a
 * later RBAC pass. Entity membership is many-to-many via {@link #entityIds}.
 */
@Entity
@Table(name = "app_users")
public class User {

    @Id
    private String id;

    @Column(nullable = false, unique = true)
    private String email;

    /** Permanent credential, stored ISO 'YYYY-MM-DD' to match the portal. */
    private String dob;

    @Column(nullable = false)
    private String status = "Active";

    @Column(name = "is_super_admin", nullable = false)
    private boolean superAdmin = false;

    @Column(name = "last_login")
    private String lastLogin;

    // Many-to-many entity membership: one person can belong to several
    // companies/institutes. Stored as plain entity ids in a join table so an
    // entity row can reference many users and vice-versa.
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "user_entities",
            joinColumns = @JoinColumn(name = "user_id"))
    @Column(name = "entity_id", nullable = false, length = 64)
    private Set<String> entityIds = new HashSet<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getDob() { return dob; }
    public void setDob(String dob) { this.dob = dob; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public boolean isSuperAdmin() { return superAdmin; }
    public void setSuperAdmin(boolean superAdmin) { this.superAdmin = superAdmin; }
    public String getLastLogin() { return lastLogin; }
    public void setLastLogin(String lastLogin) { this.lastLogin = lastLogin; }
    public Set<String> getEntityIds() { return entityIds; }
    public void setEntityIds(Set<String> entityIds) { this.entityIds = entityIds; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
