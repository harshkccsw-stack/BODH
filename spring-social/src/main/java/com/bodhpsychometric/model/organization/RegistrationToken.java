package com.bodhpsychometric.model.organization;

import java.time.OffsetDateTime;

import com.bodhpsychometric.model.assessment.OrganizationAssessmentMapping;
import com.bodhpsychometric.model.organization.enums.RegistrationTokenStatus;

import jakarta.persistence.CheckConstraint;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * A shareable self-registration link. The token string is the whole credential
 * — it travels in the URL (/register/{token}) and is the only thing standing
 * between a stranger and an account, so it is generated from SecureRandom and
 * stored in a case-SENSITIVE column (the rest of the schema is
 * utf8mb4_0900_ai_ci, under which "aB" and "Ab" would be the same token).
 *
 * A link targets exactly ONE of two things, and which column is populated IS
 * the discriminator:
 *   - organization set, mapping null → an org-wide link. The respondent picks
 *     any ACTIVE assessment from that organization's catalog.
 *   - mapping set, organization null → one catalog entry. The assessment is
 *     fixed by the link. The organization is NOT repeated here: the mapping
 *     row already carries it, and a second copy could drift from it.
 *
 * That split is what makes "no duplicate links" two ordinary unique keys
 * instead of a trick. Each key spans a nullable column, and a unique key over
 * a nullable column constrains exactly the rows where that column is present —
 * which is precisely the set meant in both cases:
 *   - uqRtOrganization                  → at most one org-wide link per org,
 *     while every assessment-scoped row (organization null) sits outside it.
 *   - uqRtOrganizationAssessmentMapping → at most one link per catalog entry,
 *     and because uqOamOrganizationAssessment already makes (org, assessment)
 *     unique, "one link per assessment per org" follows from a key that
 *     already exists rather than a new rule to keep.
 * ckRtScope is what stops a row being neither or both.
 *
 * One row per target, so rotating a link is an update in place: a new token
 * string, usedCount back to zero. There is no history of retired links — if
 * that is ever wanted it is a second table, not a second row here.
 */
@Entity
@Table(name = "RegistrationToken",
        uniqueConstraints = {
                @UniqueConstraint(name = "uqRtToken", columnNames = "token"),
                @UniqueConstraint(name = "uqRtOrganization", columnNames = "organizationId"),
                @UniqueConstraint(name = "uqRtOrganizationAssessmentMapping",
                        columnNames = "organizationAssessmentMappingId")
        },
        check = @CheckConstraint(name = "ckRtScope", constraint =
                "(organization_id is not null and organization_assessment_mapping_id is null)"
                + " or (organization_id is null and organization_assessment_mapping_id is not null)"))
public class RegistrationToken implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long registrationTokenId;

    /**
     * The URL-safe random string the respondent arrives with. 43 characters —
     * 32 bytes of SecureRandom in Base64url without padding.
     */
    @Column(name = "token", nullable = false, length = 43)
    private String token;

    /** Set only on an org-wide link; null means this row targets a mapping. */
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organizationId",
            foreignKey = @ForeignKey(name = "fkRtOrganization"))
    private Organization organization;

    /**
     * Set only on an assessment-scoped link; null means this row targets a
     * whole organization. The mapping is the source of truth for both the
     * organization and the assessment, which is why neither is duplicated
     * here — and it means unmapping the assessment must take the link with it
     * (OrganizationController does that before deleting catalog rows).
     */
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organizationAssessmentMappingId",
            foreignKey = @ForeignKey(name = "fkRtOrganizationAssessmentMapping"))
    private OrganizationAssessmentMapping organizationAssessmentMapping;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private RegistrationTokenStatus status = RegistrationTokenStatus.ACTIVE;

    /** Null means unlimited. */
    @Column(name = "maxUses")
    private Integer maxUses;

    @Column(name = "usedCount", nullable = false)
    private int usedCount = 0;

    /** Null means it never expires. */
    @Column(name = "expiresAt")
    private OffsetDateTime expiresAt;

    @Column(name = "createdAt", nullable = false)
    private OffsetDateTime createdAt;

    /** True when this link lets the respondent choose from the org's catalog. */
    public boolean isOrganizationWide() {
        return organizationAssessmentMapping == null;
    }

    /**
     * Every reason a link can be unusable, in one place. The caller reports
     * them all identically — telling a prober that their guessed token was
     * real but expired is still telling them it was real.
     */
    public boolean isUsable(OffsetDateTime now) {
        return status == RegistrationTokenStatus.ACTIVE
                && (expiresAt == null || expiresAt.isAfter(now))
                && (maxUses == null || usedCount < maxUses);
    }

    public Long getRegistrationTokenId() {
        return registrationTokenId;
    }

    public void setRegistrationTokenId(Long registrationTokenId) {
        this.registrationTokenId = registrationTokenId;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public Organization getOrganization() {
        return organization;
    }

    public void setOrganization(Organization organization) {
        this.organization = organization;
    }

    public OrganizationAssessmentMapping getOrganizationAssessmentMapping() {
        return organizationAssessmentMapping;
    }

    public void setOrganizationAssessmentMapping(
            OrganizationAssessmentMapping organizationAssessmentMapping) {
        this.organizationAssessmentMapping = organizationAssessmentMapping;
    }

    public RegistrationTokenStatus getStatus() {
        return status;
    }

    public void setStatus(RegistrationTokenStatus status) {
        this.status = status;
    }

    public Integer getMaxUses() {
        return maxUses;
    }

    public void setMaxUses(Integer maxUses) {
        this.maxUses = maxUses;
    }

    public int getUsedCount() {
        return usedCount;
    }

    public void setUsedCount(int usedCount) {
        this.usedCount = usedCount;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(OffsetDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
