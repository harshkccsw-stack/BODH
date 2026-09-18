package com.bodhpsychometric.model.auth;

import com.bodhpsychometric.model.auth.enums.PractitionerStatus;
import com.bodhpsychometric.model.auth.enums.Vertical;
import com.bodhpsychometric.model.organization.Organization;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * Practitioner record. Holding a row here is what makes someone a
 * practitioner — roles only decide what they may reach on the dashboard.
 */
@Entity
@Table(name = "PractitionerUser",
        uniqueConstraints = @UniqueConstraint(name = "uqPractitionerUserUser", columnNames = "userId"))
public class PractitionerUser implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * The identity this record belongs to. Owning side: the FK plus the unique
     * constraint on userId is what makes it one-to-one — at most one
     * practitioner record per person. It says nothing about RespondentUser, so
     * the same person may hold both.
     */
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "userId", nullable = false,
            foreignKey = @ForeignKey(name = "fkPractitionerUserUser"))
    private User user;

    @Column(name = "name")
    private String name;

    /**
     * The dial code the number belongs to, '+' included (e.g. "+91"). Split
     * from {@link #phone} for the reason RespondentUser's is: the code says
     * which country, which is the only thing that makes a national number
     * length-checkable at all.
     *
     * <p>Nullable, and deliberately NOT backfilled. Every practitioner created
     * before this column has a free-text phone in whatever shape they typed
     * and no code beside it; guessing one from the digits would invent a
     * country nobody stated. Those rows keep what they have and are brought up
     * to shape only when someone edits them.
     */
    @Column(name = "phoneCountryCode", length = 8)
    private String phoneCountryCode;

    /**
     * The national (subscriber) number alone, in E.164 form: digits only, no
     * punctuation, no country code, no trunk prefix. Rows older than the split
     * still hold free text such as "+91 98765 43210" — read this column
     * defensively.
     */
    @Column(name = "phone")
    private String phone;

    @Enumerated(value = jakarta.persistence.EnumType.STRING)
    @Column(name = "practitioner_status", nullable = false, length = 20)
    private PractitionerStatus practitionerStatus;

    @Enumerated(value = jakarta.persistence.EnumType.STRING)
    @Column(name = "vertical")
    private Vertical vertical;

    /** At most one organization per practitioner; null means independent. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organizationId",
            foreignKey = @ForeignKey(name = "fkPractitionerUserOrganization"))
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
     * that DISPLAYS a phone rather than editing it.
     *
     * <p>Falls back to the raw column when there is no country code, which is
     * every row written before the split: those already hold whatever free
     * text was typed, often with a "+91 " of their own, so joining nothing
     * onto them is exactly right.
     *
     * <p>Not a mapped property. This entity uses field access, so Hibernate
     * never looks at accessors, and the name deliberately drops the `get`
     * prefix so it cannot be mistaken for one.
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

    public PractitionerStatus getPractitionerStatus() {
        return practitionerStatus;
    }

    public void setPractitionerStatus(PractitionerStatus practitionerStatus) {
        this.practitionerStatus = practitionerStatus;
    }

   
    public Vertical getVertical() {
        return vertical;
    }

    public void setVertical(Vertical vertical) {
        this.vertical = vertical;
    }

    public Organization getOrganization() {
        return organization;
    }

    public void setOrganization(Organization organization) {
        this.organization = organization;
    }

}
