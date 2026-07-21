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
