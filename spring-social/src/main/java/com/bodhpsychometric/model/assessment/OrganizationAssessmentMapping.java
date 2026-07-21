package com.bodhpsychometric.model.assessment;

import java.time.OffsetDateTime;

import com.bodhpsychometric.model.organization.Organization;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * An organization's assessment catalog entry — data segregation, not
 * delivery. Mapping an assessment here is what makes it assignable to the
 * org's members (RespondentAssessmentMapping enforces that rule at assign
 * time). One assessment may be mapped to many orgs; the pair is unique.
 */
@Entity
@Table(name = "OrganizationAssessmentMapping",
        uniqueConstraints = @UniqueConstraint(name = "uqOamOrganizationAssessment",
                columnNames = {"organizationId", "assessmentId"}),
        indexes = @Index(name = "idxOamAssessment", columnList = "assessmentId"))
public class OrganizationAssessmentMapping implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long organizationAssessmentMappingId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organizationId", nullable = false,
            foreignKey = @ForeignKey(name = "fkOamOrganization"))
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assessmentId", nullable = false,
            foreignKey = @ForeignKey(name = "fkOamAssessment"))
    private Assessment assessment;

    @Column(name = "mappedAt", nullable = false)
    private OffsetDateTime mappedAt;

    public Long getOrganizationAssessmentMappingId() {
        return organizationAssessmentMappingId;
    }

    public void setOrganizationAssessmentMappingId(Long organizationAssessmentMappingId) {
        this.organizationAssessmentMappingId = organizationAssessmentMappingId;
    }

    public Organization getOrganization() {
        return organization;
    }

    public void setOrganization(Organization organization) {
        this.organization = organization;
    }

    public Assessment getAssessment() {
        return assessment;
    }

    public void setAssessment(Assessment assessment) {
        this.assessment = assessment;
    }

    public OffsetDateTime getMappedAt() {
        return mappedAt;
    }

    public void setMappedAt(OffsetDateTime mappedAt) {
        this.mappedAt = mappedAt;
    }
}
