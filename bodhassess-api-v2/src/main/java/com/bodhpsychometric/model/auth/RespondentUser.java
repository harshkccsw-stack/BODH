package com.bodhpsychometric.model.auth;

import java.time.OffsetDateTime;
import java.util.Date;

import com.bodhpsychometric.model.auth.enums.Gender;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * Respondent record. Holding a row here is what makes someone a respondent —
 * roles only decide what they may reach on the dashboard.
 */
@Entity
@Table(name = "RespondentUser",
        uniqueConstraints = @UniqueConstraint(name = "uqRespondentUserUser", columnNames = "userId"))
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

    @Column(name = "phone")
    private String phone;

    @Column(name = "gender")
    private Gender gender;

    @Column(name = "dob")
    private Date dateOfBirth;
    
    @Column(name = "is_consented", nullable = false)
    private boolean isConsented;

    @Column(name = "consented_at")
    private OffsetDateTime consentedAt;


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

    
}
