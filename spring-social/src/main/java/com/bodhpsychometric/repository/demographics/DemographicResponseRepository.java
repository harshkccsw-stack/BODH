package com.bodhpsychometric.repository.demographics;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;

import com.bodhpsychometric.model.demographics.DemographicResponse;

public interface DemographicResponseRepository extends JpaRepository<DemographicResponse, Long> {

    boolean existsByDemographicFieldDemographicFieldId(Long demographicFieldId);

    /** Does this (respondent, assessment) pair hold a demographic set yet? */
    boolean existsByRespondent_IdAndAssessment_AssessmentId(Long respondentUserId, Long assessmentId);

    /** Replace-all write on begin, and cleanup when an allotment is removed. */
    @Modifying
    void deleteByRespondent_IdAndAssessment_AssessmentId(Long respondentUserId, Long assessmentId);
}
