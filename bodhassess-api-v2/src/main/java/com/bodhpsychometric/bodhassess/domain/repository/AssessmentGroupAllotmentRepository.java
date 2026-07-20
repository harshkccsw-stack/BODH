package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.assessment.AssessmentGroupAllotment;

public interface AssessmentGroupAllotmentRepository extends JpaRepository<AssessmentGroupAllotment, Long> {

    List<AssessmentGroupAllotment> findByAssessmentId(Long assessmentId);

    List<AssessmentGroupAllotment> findByGroupId(Long groupId);

    Optional<AssessmentGroupAllotment> findByAssessmentIdAndGroupId(Long assessmentId, Long groupId);

    boolean existsByAssessmentIdAndGroupId(Long assessmentId, Long groupId);
}
