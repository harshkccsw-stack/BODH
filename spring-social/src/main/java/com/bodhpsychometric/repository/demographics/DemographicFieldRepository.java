package com.bodhpsychometric.repository.demographics;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.demographics.DemographicField;

public interface DemographicFieldRepository extends JpaRepository<DemographicField, Long> {

    boolean existsByLabelIgnoreCase(String label);

    boolean existsByLabelIgnoreCaseAndDemographicFieldIdNot(String label, Long demographicFieldId);
}
