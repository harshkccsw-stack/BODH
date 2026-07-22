package com.bodhpsychometric.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.delivery.AssessmentSession;

public interface AssessmentSessionRepository extends JpaRepository<AssessmentSession, Long> {

    List<AssessmentSession> findByAssessmentIdAndDeletedAtIsNull(Long assessmentId);

    List<AssessmentSession> findByUserIdAndDeletedAtIsNull(Long userId);

    Optional<AssessmentSession> findByAssessmentIdAndUserIdAndDeletedAtIsNull(Long assessmentId, Long userId);

    boolean existsByAssessmentIdAndUserIdAndDeletedAtIsNull(Long assessmentId, Long userId);

    Optional<AssessmentSession> findByIdAndDeletedAtIsNull(Long id);

    List<AssessmentSession> findByDeletedAtIsNotNull();

    /**
     * Cap accounting, organization scope: sessions whose LIVE attempt
     * (archivedAt IS NULL) is COMPLETED. Submit consumes a slot, admin reset
     * (archiving the attempt) frees it. The service compares this against the
     * allotment cap at session start AND re-checks at submit.
     */
    @Query("select count(s) from AssessmentSession s join s.attempts a"
            + " where s.assessment.id = :assessmentId and s.organization.id = :organizationId"
            + " and s.deletedAt is null and a.archivedAt is null"
            + " and a.status = com.bodhpsychometric.model.delivery.AttemptStatus.COMPLETED")
    long countCapConsumedForOrganization(@Param("assessmentId") Long assessmentId,
                                         @Param("organizationId") Long organizationId);

    /** Cap accounting, group scope — same semantics as the organization query. */
    @Query("select count(s) from AssessmentSession s join s.attempts a"
            + " where s.assessment.id = :assessmentId and s.group.id = :groupId"
            + " and s.deletedAt is null and a.archivedAt is null"
            + " and a.status = com.bodhpsychometric.model.delivery.AttemptStatus.COMPLETED")
    long countCapConsumedForGroup(@Param("assessmentId") Long assessmentId,
                                  @Param("groupId") Long groupId);
}
