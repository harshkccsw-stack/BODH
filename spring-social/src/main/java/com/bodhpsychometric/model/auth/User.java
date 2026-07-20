package com.bodhpsychometric.model.auth;

import java.time.LocalDate;
import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;


/**
 * The single identity for every actor — admin, practitioner, and respondent
 * are roles on this table, not separate tables (the old practitioner /
 * respondent silos fold in at migration). One person holds as many roles as
 * they need: being both a practitioner and a respondent is one User with two
 * roles and two profile rows, never two accounts.
 *
 * Two unique keys identify a person: serialId (the code shown on screens and
 * quoted in support) and email. dob is the credential by product decision —
 * typed as a real date, compared by the auth service. superAdmin deliberately
 * sits above the role system and overrides all permission checks.
 *
 * Note: the legacy DB contains an unmapped `users` table predating the old
 * model; the cutover migration must archive it so it never collides with
 * this one.
 */
@Entity
@Table(name = "User",
        uniqueConstraints = {
                @UniqueConstraint(name = "uqUserEmail", columnNames = "email"),
                @UniqueConstraint(name = "uqUserSerialId", columnNames = "serialId")
        })
public class User implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Human-facing account code, "USR-000012". Assigned by UserService right
     * after insert (it is derived from the generated id, so it cannot be set
     * before the row exists) — hence nullable in the mapping even though every
     * row created through the service, the bootstrap, or the V4 backfill has
     * one.
     */
    @Column(name = "serialId", length = 20)
    private String serialId;

    @Column(name = "email", nullable = false, length = 255)
    private String email;

    /**
     * The credential: login is email + dob, compared by the auth service.
     * Lives here, not on the profiles, so every actor — superadmin included,
     * who has no profile row — signs in the same way and there is exactly one
     * dob per person.
     */
    @Column(name = "dob", nullable = false)
    private LocalDate dob;

    @Column(name = "account_status")
    private boolean accountStatus;

    @Column(name = "isSuperAdmin", nullable = false)
    private boolean superAdmin;

    @Column(name = "lastLoginAt")
    private OffsetDateTime lastLoginAt;

    /**
     * Dashboard access: exactly one group per user, so what they may open is
     * the union of the paths of the roles inside it. Null means no dashboard
     * access at all — the correct default for a respondent-only account.
     * isSuperAdmin still overrides this entirely.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "roleGroupId",
            foreignKey = @ForeignKey(name = "fkUserRoleGroup"))
    private RoleGroup roleGroup;

   

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSerialId() {
        return serialId;
    }

    public void setSerialId(String serialId) {
        this.serialId = serialId;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public LocalDate getDob() {
        return dob;
    }

    public void setDob(LocalDate dob) {
        this.dob = dob;
    }

    public boolean isAccountStatus() {
        return accountStatus;
    }

    public void setAccountStatus(boolean accountStatus) {
        this.accountStatus = accountStatus;
    }

    public boolean isSuperAdmin() {
        return superAdmin;
    }

    public void setSuperAdmin(boolean superAdmin) {
        this.superAdmin = superAdmin;
    }

    public OffsetDateTime getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(OffsetDateTime lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public RoleGroup getRoleGroup() {
        return roleGroup;
    }

    public void setRoleGroup(RoleGroup roleGroup) {
        this.roleGroup = roleGroup;
    }

    
}
