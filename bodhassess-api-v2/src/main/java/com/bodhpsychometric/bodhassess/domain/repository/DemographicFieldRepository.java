package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.assessment.DemographicField;

public interface DemographicFieldRepository extends JpaRepository<DemographicField, Long> {

    Optional<DemographicField> findByFieldKey(String fieldKey);

    boolean existsByFieldKey(String fieldKey);

    /** What the questionnaire builder offers authors. */
    List<DemographicField> findByActiveTrueAndDeletedAtIsNullOrderByLabelAsc();

    List<DemographicField> findByDeletedAtIsNullOrderByLabelAsc();

    Optional<DemographicField> findByIdAndDeletedAtIsNull(Long id);
}
