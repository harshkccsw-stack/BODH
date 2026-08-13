package com.bodhpsychometric.repository.organization;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.organization.RegistrationToken;

public interface RegistrationTokenRepository extends JpaRepository<RegistrationToken, Long> {

    /**
     * The portal's whole read side in one query: the token row plus whichever
     * of its two targets is set, deep enough to name the organization and the
     * assessment without a lazy load. The join is the reason a link can be
     * resolved with a single round trip regardless of its scope.
     */
    @Query("select t from RegistrationToken t "
            + "left join fetch t.organization "
            + "left join fetch t.organizationAssessmentMapping m "
            + "left join fetch m.organization "
            + "left join fetch m.assessment "
            + "where t.token = :token")
    Optional<RegistrationToken> findByTokenForResolve(String token);

    /** The org-wide link, if one has been minted. Unique by uqRtOrganization. */
    @Query("select t from RegistrationToken t where t.organization.organizationId = :organizationId")
    Optional<RegistrationToken> findOrganizationWide(Long organizationId);

    /**
     * Every assessment-scoped link belonging to this organization. Reached
     * THROUGH the mapping, since those rows carry no organizationId of their
     * own — the mapping is the single source of truth for the pair.
     */
    @Query("select t from RegistrationToken t "
            + "join fetch t.organizationAssessmentMapping m join fetch m.assessment "
            + "where m.organization.organizationId = :organizationId")
    List<RegistrationToken> findAssessmentScopedForOrganization(Long organizationId);

    /**
     * Spend one use, atomically. Read-then-increment would let two concurrent
     * registrations both consume the last use of a capped link, so the cap is
     * re-checked inside the UPDATE: 1 row means the use was taken, 0 means the
     * link ran out between resolving it and getting here.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update RegistrationToken t set t.usedCount = t.usedCount + 1 "
            + "where t.registrationTokenId = :registrationTokenId "
            + "and (t.maxUses is null or t.usedCount < t.maxUses)")
    int consumeOneUse(Long registrationTokenId);

    /** Minting guard — the random string must not already be taken. */
    boolean existsByToken(String token);

    /**
     * The two duplicate pre-checks, one per scope. They restate what
     * uqRtOrganization and uqRtOrganizationAssessmentMapping already enforce,
     * because a constraint violation inside @Transactional marks the
     * transaction rollback-only and 500s at commit even after a 409 is
     * returned — the key is the backstop, this is the answer.
     */
    boolean existsByOrganization_OrganizationId(Long organizationId);

    boolean existsByOrganizationAssessmentMapping_OrganizationAssessmentMappingId(
            Long organizationAssessmentMappingId);

    /** Cleanup paths: a link cannot outlive the organization or catalog row it targets. */
    void deleteByOrganization_OrganizationId(Long organizationId);

    void deleteByOrganizationAssessmentMapping_OrganizationAssessmentMappingIdIn(
            List<Long> organizationAssessmentMappingIds);
}
