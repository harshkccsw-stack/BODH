package com.bodhpsychometric.model.organization;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * An organization (school, clinic, company) that practitioners and
 * respondents belong to. Membership is single: each profile row carries at
 * most one organizationId — there is no multi-org membership and so no join
 * table.
 */
@Entity
@Table(name = "Organization",
        uniqueConstraints = @UniqueConstraint(name = "uqOrganizationName", columnNames = "name"))
public class Organization implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long organizationId;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "org_email",  length = 200)
    private String orgEmail;

    // Logo stored inline as a base64 data URL (e.g. "data:image/png;base64,…")
    // so the frontend can bind it straight to an <img src>. LONGTEXT because a
    // data URL for even a small logo overruns TEXT's 64 KB. No object storage
    // yet — this is the agreed interim (see the create/edit org form).
    @Column(name = "logo_base64", columnDefinition = "LONGTEXT")
    private String logoBase64;

    public Long getOrganizationId() {
        return organizationId;
    }

    public void setOrganizationId(Long organizationId) {
        this.organizationId = organizationId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getOrgEmail() {
        return orgEmail;
    }

    public void setOrgEmail(String orgEmail) {
        this.orgEmail = orgEmail;
    }

    public String getLogoBase64() {
        return logoBase64;
    }

    public void setLogoBase64(String logoBase64) {
        this.logoBase64 = logoBase64;
    }
}
