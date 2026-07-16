package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.assessment.AssessmentRespondentAllotment;

public interface AssessmentRespondentAllotmentRepository
        extends JpaRepository<AssessmentRespondentAllotment, Long> {

    List<AssessmentRespondentAllotment> findByAssessmentId(Long assessmentId);

    List<AssessmentRespondentAllotment> findByUserId(Long userId);

    Optional<AssessmentRespondentAllotment> findByAssessmentIdAndUserId(Long assessmentId, Long userId);

    boolean existsByAssessmentIdAndUserId(Long assessmentId, Long userId);
}
