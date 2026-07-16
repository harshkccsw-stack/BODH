package com.bodhpsychometric.bodhassess.domain.people;

import java.util.HashSet;
import java.util.Set;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import com.bodhpsychometric.bodhassess.domain.base.SoftDeletableEntity;

/**
 * The company / institute master record — replaces the legacy
 * entity_registrations table, which fused this with a person-shaped signup
 * form and provisioning string-bags. Provisioning stays deliberately simple
 * for now (string value-tables); the assessment allow-list became real
 * allotment rows.
 */
@Entity
@Table(name = "Organization")
public class Organization extends SoftDeletableEntity {

    private static final long serialVersionUID = 1L;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Column(name = "website", length = 255)
    private String website;

    @Column(name = "contactName", length = 150)
    private String contactName;

    @Column(name = "contactEmail", length = 255)
    private String contactEmail;

    @Column(name = "contactPhone", length = 20)
    private String contactPhone;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private OrganizationStatus status = OrganizationStatus.PENDING;

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "OrganizationVertical",
            joinColumns = @JoinColumn(name = "organizationId",
                    foreignKey = @ForeignKey(name = "fkOrgVerticalOrg")))
    @Column(name = "vertical", nullable = false, length = 128)
    private Set<String> verticals = new HashSet<>();

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "OrganizationModule",
            joinColumns = @JoinColumn(name = "organizationId",
                    foreignKey = @ForeignKey(name = "fkOrgModuleOrg")))
    @Column(name = "module", nullable = false, length = 128)
    private Set<String> platformModules = new HashSet<>();

    @OneToMany(mappedBy = "organization", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<OrganizationMember> members = new HashSet<>();

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getWebsite() { return website; }
    public void setWebsite(String website) { this.website = website; }
    public String getContactName() { return contactName; }
    public void setContactName(String contactName) { this.contactName = contactName; }
    public String getContactEmail() { return contactEmail; }
    public void setContactEmail(String contactEmail) { this.contactEmail = contactEmail; }
    public String getContactPhone() { return contactPhone; }
    public void setContactPhone(String contactPhone) { this.contactPhone = contactPhone; }
    public OrganizationStatus getStatus() { return status; }
    public void setStatus(OrganizationStatus status) { this.status = status; }
    public Set<String> getVerticals() { return verticals; }
    public void setVerticals(Set<String> verticals) { this.verticals = verticals; }
    public Set<String> getPlatformModules() { return platformModules; }
    public void setPlatformModules(Set<String> platformModules) { this.platformModules = platformModules; }
    public Set<OrganizationMember> getMembers() { return members; }
    public void setMembers(Set<OrganizationMember> members) { this.members = members; }

    public void addMember(OrganizationMember member) {
        members.add(member);
        member.setOrganization(this);
    }
}
