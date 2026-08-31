package com.bodhpsychometric.model.auth;

import java.time.OffsetDateTime;

import com.bodhpsychometric.model.auth.enums.Gender;
import com.bodhpsychometric.model.organization.Organization;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * Respondent record. Holding a row here is what makes someone a respondent —
 * roles only decide what they may reach on the dashboard.
 */
@Entity
@Table(name = "RespondentUser",
        uniqueConstraints = {
                @UniqueConstraint(name = "uqRespondentUserUser", columnNames = "userId"),
                @UniqueConstraint(name = "uqRespondentUserOrgEmployeeId",
                        columnNames = { "organizationId", "employeeId" })
        })
public class RespondentUser implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = jakarta.persistence.GenerationType.IDENTITY)
    private Long id;

    /**
     * The identity this record belongs to. Owning side: the FK plus the unique
     * constraint on userId is what makes it one-to-one — at most one
     * respondent record per person. It says nothing about PractitionerUser, so
     * the same person may hold both.
     */
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "userId", nullable = false,
            foreignKey = @ForeignKey(name = "fkRespondentUserUser"))
    private User user;

    @Column(name = "name")
    private String name;

    /**
     * The dial code the number belongs to, '+' included (e.g. "+91"). Split
     * from {@link #phone} rather than folded into it so the pair is two
     * checkable values: the code says which country, which is the only thing
     * that makes a fixed-length national number checkable at all.
     *
     * <p>Nullable, and deliberately NOT backfilled. Every respondent created
     * before 2026-08-31 has a free-text phone in whatever shape they typed and
     * no code beside it; guessing one from the digits would invent a country
     * nobody stated. Those rows keep what they have and are only brought up to
     * the new shape when someone edits them.
     */
    @Column(name = "phoneCountryCode", length = 8)
    private String phoneCountryCode;

    /**
     * The national (subscriber) number alone, in E.164 form: digits only, no
     * punctuation, no country code, no trunk prefix — for anything written
     * since 2026-08-31. Rows older than that still hold free text such as
     * "+91 98765 43210"; read this column defensively.
     */
    @Column(name = "phone")
    private String phone;

    /**
     * Optional employer-issued code, the second thing a respondent may sign in
     * with (portal login takes email OR employeeId, both against dob). Unique
     * per organization, not globally — two clients may each issue "EMP001" —
     * which is why it lives here next to organizationId and not on User, whose
     * rows carry no organization.
     *
     * Alphanumeric by validation, so it can never contain '@'. That is what
     * lets PortalAuthService split one login field into "email" vs "employee
     * id" with no chance of the two namespaces colliding.
     */
    @Column(name = "employeeId", length = 32)
    private String employeeId;

    @Enumerated(value = jakarta.persistence.EnumType.STRING)
    @Column(name = "gender")
    private Gender gender;

    @Column(name = "is_consented", nullable = false)
    private boolean isConsented;

    @Column(name = "consented_at")
    private OffsetDateTime consentedAt;

    /** At most one organization per respondent; null means unaffiliated. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organizationId",
            foreignKey = @ForeignKey(name = "fkRespondentUserOrganization"))
    private Organization organization;


    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPhoneCountryCode() {
        return phoneCountryCode;
    }

    public void setPhoneCountryCode(String phoneCountryCode) {
        this.phoneCountryCode = phoneCountryCode;
    }

    /**
     * The whole number as one E.164 string — "+919876543210" — for anything
     * that DISPLAYS a phone rather than editing it (reports, exports).
     *
     * <p>Falls back to the raw column when there is no country code, which is
     * every row written before the split: those already hold whatever free
     * text was typed, often with a "+91 " of their own, so joining nothing
     * onto them is exactly right.
     *
     * <p>Not a mapped property. This entity uses field access — the
     * annotations sit on the fields — so Hibernate never looks at accessors,
     * and the name deliberately drops the `get` prefix so it cannot be
     * mistaken for one.
     */
    public String displayPhone() {
        if (phone == null || phone.isBlank()) {
            return phone;
        }
        return phoneCountryCode == null || phoneCountryCode.isBlank()
                ? phone
                : phoneCountryCode + phone;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getEmployeeId() {
        return employeeId;
    }

    public void setEmployeeId(String employeeId) {
        this.employeeId = employeeId;
    }

    public Gender getGender() {
        return gender;
    }

    public void setGender(Gender gender) {
        this.gender = gender;
    }

    public boolean isConsented() {
        return isConsented;
    }

    public void setConsented(boolean isConsented) {
        this.isConsented = isConsented;
    }

    public OffsetDateTime getConsentedAt() {
        return consentedAt;
    }

    public void setConsentedAt(OffsetDateTime consentedAt) {
        this.consentedAt = consentedAt;
    }

    public Organization getOrganization() {
        return organization;
    }

    public void setOrganization(Organization organization) {
        this.organization = organization;
    }

    
}
