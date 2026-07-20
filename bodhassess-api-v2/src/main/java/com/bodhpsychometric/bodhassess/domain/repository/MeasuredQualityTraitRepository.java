package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.taxonomy.MeasuredQualityTrait;

public interface MeasuredQualityTraitRepository extends JpaRepository<MeasuredQualityTrait, Long> {

    List<MeasuredQualityTrait> findByDeletedAtIsNullOrderByNameAsc();

    Optional<MeasuredQualityTrait> findByIdAndDeletedAtIsNull(Long id);

    List<MeasuredQualityTrait> findByDeletedAtIsNotNull();

    // Names are intentionally not unique — this returns all homonyms so the
    // library UI can disambiguate by description.
    List<MeasuredQualityTrait> findByNameContainingIgnoreCaseAndDeletedAtIsNull(String name);
}
