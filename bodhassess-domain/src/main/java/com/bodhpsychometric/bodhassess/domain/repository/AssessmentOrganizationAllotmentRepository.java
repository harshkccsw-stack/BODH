package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.assessment.AssessmentOrganizationAllotment;

public interface AssessmentOrganizationAllotmentRepository
        extends JpaRepository<AssessmentOrganizationAllotment, Long> {

    List<AssessmentOrganizationAllotment> findByAssessmentId(Long assessmentId);

    List<AssessmentOrganizationAllotment> findByOrganizationId(Long organizationId);

    Optional<AssessmentOrganizationAllotment> findByAssessmentIdAndOrganizationId(
            Long assessmentId, Long organizationId);

    boolean existsByAssessmentIdAndOrganizationId(Long assessmentId, Long organizationId);
}
