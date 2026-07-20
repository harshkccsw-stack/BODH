package com.bodhpsychometric.bodhassess.domain.people;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;

import jakarta.annotation.Generated;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.bodhassess.domain.base.SoftDeletableEntity;

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
public class User extends SoftDeletableEntity implements java.io.Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

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

    @Column(name = "dob")
    private LocalDate dob;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private UserStatus status = UserStatus.ACTIVE;

    @Column(name = "isSuperAdmin", nullable = false)
    private boolean superAdmin;

    @Column(name = "lastLoginAt")
    private OffsetDateTime lastLoginAt;

    @Column(name = "name", length = 150)
    private String name;

    @Column(name = "phone", length = 20)
    private String phone;

    @Column(name = "gender", length = 20)
    private String gender;

    @Column(name = "consent", nullable = false)
    private boolean consent;

    @Column(name = "consentedAt")
    private OffsetDateTime consentedAt;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<UserRole> roles = new HashSet<>();

    public String getSerialId() { return serialId; }
    public void setSerialId(String serialId) { this.serialId = serialId; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public LocalDate getDob() { return dob; }
    public void setDob(LocalDate dob) { this.dob = dob; }
    public UserStatus getStatus() { return status; }
    public void setStatus(UserStatus status) { this.status = status; }
    public boolean isSuperAdmin() { return superAdmin; }
    public void setSuperAdmin(boolean superAdmin) { this.superAdmin = superAdmin; }
    public OffsetDateTime getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(OffsetDateTime lastLoginAt) { this.lastLoginAt = lastLoginAt; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }
    public boolean isConsent() { return consent; }
    public void setConsent(boolean consent) { this.consent = consent; }
    public OffsetDateTime getConsentedAt() { return consentedAt; }
    public void setConsentedAt(OffsetDateTime consentedAt) { this.consentedAt = consentedAt; }
    public Set<UserRole> getRoles() { return roles; }
    public void setRoles(Set<UserRole> roles) { this.roles = roles; }

    public void addRole(UserRole role) {
        roles.add(role);
        role.setUser(this);
    }

    public void removeRole(UserRole role) {
        roles.remove(role);
        role.setUser(null);
    }
}
