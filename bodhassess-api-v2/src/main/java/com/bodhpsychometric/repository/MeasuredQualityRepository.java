package com.bodhpsychometric.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.taxonomy.MeasuredQuality;

/**
 * Liveness is explicit in every query name (no global soft-delete filters,
 * by convention) — the recycle-bin views use the plain findAll/findById.
 */
public interface MeasuredQualityRepository extends JpaRepository<MeasuredQuality, Long> {

    List<MeasuredQuality> findByDeletedAtIsNullOrderByNameAsc();

    Optional<MeasuredQuality> findByIdAndDeletedAtIsNull(Long id);

    List<MeasuredQuality> findByDeletedAtIsNotNull();

    List<MeasuredQuality> findByNameContainingIgnoreCaseAndDeletedAtIsNull(String name);
}
