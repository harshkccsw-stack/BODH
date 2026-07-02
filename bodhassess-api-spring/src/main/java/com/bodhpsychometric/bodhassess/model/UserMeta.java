package com.bodhpsychometric.bodhassess.model;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

/**
 * Profile / demographic data for a {@link User}, kept out of the credentials
 * table. One-to-one with {@code app_users} (shares the user id as PK).
 *
 * Deliberately holds NO authentication fields and NO role/account-type
 * marker — "who can do what" is the future RBAC layer's job, resolved via
 * roles, not a column here.
 */
@Entity
@Table(name = "user_meta")
public class UserMeta {

    @Id
    @Column(name = "user_id")
    private String userId;

    private String name;

    private String phone;

    private String gender;

    private String consent;

    @Column(name = "company_id")
    private String companyId;

    @Column(name = "org_name")
    private String orgName;

    @Column(name = "org_website")
    private String orgWebsite;

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }
    public String getConsent() { return consent; }
    public void setConsent(String consent) { this.consent = consent; }
    public String getCompanyId() { return companyId; }
    public void setCompanyId(String companyId) { this.companyId = companyId; }
    public String getOrgName() { return orgName; }
    public void setOrgName(String orgName) { this.orgName = orgName; }
    public String getOrgWebsite() { return orgWebsite; }
    public void setOrgWebsite(String orgWebsite) { this.orgWebsite = orgWebsite; }
}
