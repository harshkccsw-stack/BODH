package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.auth.unnecessary.RespondentGroupMember;

/** Temporal, same contract as {@link OrganizationMemberRepository}. */
public interface RespondentGroupMemberRepository extends JpaRepository<RespondentGroupMember, Long> {

    List<RespondentGroupMember> findByGroupIdAndRemovedAtIsNull(Long groupId);

    List<RespondentGroupMember> findByUserIdAndRemovedAtIsNull(Long userId);

    Optional<RespondentGroupMember> findByGroupIdAndUserIdAndRemovedAtIsNull(Long groupId, Long userId);

    boolean existsByGroupIdAndUserIdAndRemovedAtIsNull(Long groupId, Long userId);

    List<RespondentGroupMember> findByUserIdOrderByCreatedAtDesc(Long userId);

    long countByGroupIdAndRemovedAtIsNull(Long groupId);
}
