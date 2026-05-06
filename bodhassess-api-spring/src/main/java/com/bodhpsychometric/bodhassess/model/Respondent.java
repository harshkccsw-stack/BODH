package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

@Entity
@Table(name = "respondents")
public class Respondent {

    @Id
    private String id;

    private String name;

    private String email;

    private String phone;

    private String dob;

    private String consent;

    @Column(name = "sessions_count")
    private Integer sessionsCount;

    @Column(name = "last_assessment")
    private String lastAssessment;

    @Column(name = "account_type")
    private String accountType;

    @Column(name = "org_name")
    private String orgName;

    @Column(name = "org_website")
    private String orgWebsite;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getDob() { return dob; }
    public void setDob(String dob) { this.dob = dob; }
    public String getConsent() { return consent; }
    public void setConsent(String consent) { this.consent = consent; }
    public Integer getSessionsCount() { return sessionsCount; }
    public void setSessionsCount(Integer sessionsCount) { this.sessionsCount = sessionsCount; }
    public String getLastAssessment() { return lastAssessment; }
    public void setLastAssessment(String lastAssessment) { this.lastAssessment = lastAssessment; }
    public String getAccountType() { return accountType; }
    public void setAccountType(String accountType) { this.accountType = accountType; }
    public String getOrgName() { return orgName; }
    public void setOrgName(String orgName) { this.orgName = orgName; }
    public String getOrgWebsite() { return orgWebsite; }
    public void setOrgWebsite(String orgWebsite) { this.orgWebsite = orgWebsite; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
