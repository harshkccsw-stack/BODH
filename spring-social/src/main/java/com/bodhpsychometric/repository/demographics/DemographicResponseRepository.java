package com.bodhpsychometric.repository.demographics;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.demographics.DemographicResponse;

public interface DemographicResponseRepository extends JpaRepository<DemographicResponse, Long> {

    boolean existsByDemographicFieldDemographicFieldId(Long demographicFieldId);

    /** Any saved demographics freeze an attempt — pre-checked before unassign. */
    boolean existsByMapping_RespondentAssessmentMappingId(Long respondentAssessmentMappingId);
}
