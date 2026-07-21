package com.bodhpsychometric.repository.assessment;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;

public interface RespondentAssessmentMappingRepository extends JpaRepository<RespondentAssessmentMapping, Long> {

    long countByAssessmentAssessmentId(Long assessmentId);

    /** Attempt rows block respondent deletion — pre-checked, never caught. */
    boolean existsByRespondent_Id(Long respondentUserId);
}
