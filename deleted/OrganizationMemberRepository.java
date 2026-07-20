package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.auth.unnecessary.OrganizationMember;

/**
 * Temporal membership: rows are never deleted — leaving stamps removedAt,
 * re-joining inserts a new row. "Active" always means removedAt IS NULL; the
 * service keeps at most one active row per (organization, user) pair.
 */
public interface OrganizationMemberRepository extends JpaRepository<OrganizationMember, Long> {

    List<OrganizationMember> findByOrganizationIdAndRemovedAtIsNull(Long organizationId);

    List<OrganizationMember> findByUserIdAndRemovedAtIsNull(Long userId);

    Optional<OrganizationMember> findByOrganizationIdAndUserIdAndRemovedAtIsNull(Long organizationId, Long userId);

    boolean existsByOrganizationIdAndUserIdAndRemovedAtIsNull(Long organizationId, Long userId);

    /** Full history, joins and leaves included. */
    List<OrganizationMember> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<OrganizationMember> findByOrganizationIdOrderByCreatedAtDesc(Long organizationId);

    long countByOrganizationIdAndRemovedAtIsNull(Long organizationId);
}
