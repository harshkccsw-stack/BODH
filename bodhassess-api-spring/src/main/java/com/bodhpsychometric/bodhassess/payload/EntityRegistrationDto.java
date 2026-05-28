package com.bodhpsychometric.bodhassess.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Wire shape for the public entity-registration form. Mirrors RespondentDto
 * so the admin "view" page can render the same columns without translating.
 */
public class EntityRegistrationDto {
    private String id;
    private String name;
    private String companyName;
    private String email;
    private String phone;
    private String dob;
    @JsonProperty("sessions_count")
    private Integer sessionsCount;
    @JsonProperty("last_assessment")
    private String lastAssessment;
    private String accountType;
    private String orgName;
    private String orgWebsite;
    @JsonProperty("created_at")
    private String createdAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getDob() { return dob; }
    public void setDob(String dob) { this.dob = dob; }
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
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
