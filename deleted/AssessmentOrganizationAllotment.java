package com.bodhpsychometric.bodhassess.domain.assessment;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import com.bodhpsychometric.bodhassess.domain.auth.unnecessary.Organization;
import com.bodhpsychometric.bodhassess.domain.base.BaseEntity;

/**
 * Allots an assessment to an organization. cap = maximum COMPLETED sessions
 * in this scope (NULL = unlimited): consumed when a taker submits, freed when
 * an admin resets, never consumed by in-progress attempts. The service
 * re-checks the cap at submit to close the concurrent-takers race.
 */
@Entity
@Table(name = "AssessmentOrganizationAllotment",
        uniqueConstraints = @UniqueConstraint(name = "uqAllotAssessmentOrg",
                columnNames = {"assessmentId", "organizationId"}),
        indexes = @Index(name = "idxAllotOrgOrganization", columnList = "organizationId"))
public class AssessmentOrganizationAllotment extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assessmentId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAllotOrgAssessment"))
    private Assessment assessment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organizationId", nullable = false,
            foreignKey = @ForeignKey(name = "fkAllotOrgOrganization"))
    private Organization organization;

    @Column(name = "cap")
    private Integer cap;

    public Assessment getAssessment() { return assessment; }
    public void setAssessment(Assessment assessment) { this.assessment = assessment; }
    public Organization getOrganization() { return organization; }
    public void setOrganization(Organization organization) { this.organization = organization; }
    public Integer getCap() { return cap; }
    public void setCap(Integer cap) { this.cap = cap; }
}
