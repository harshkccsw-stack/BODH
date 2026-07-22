package com.bodhpsychometric.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.taxonomy.TraitPlacement;

public interface TraitPlacementRepository extends JpaRepository<TraitPlacement, Long> {

    /** Top level of one MQ's tree (placements collection on MQ holds ALL levels). */
    List<TraitPlacement> findByMeasuredQualityIdAndParentIsNullAndDeletedAtIsNullOrderBySortOrderAsc(Long measuredQualityId);

    List<TraitPlacement> findByParentIdAndDeletedAtIsNullOrderBySortOrderAsc(Long parentId);

    List<TraitPlacement> findByMeasuredQualityIdAndDeletedAtIsNull(Long measuredQualityId);

    /** Where-used: every MQ context a shared trait appears in. */
    List<TraitPlacement> findByTraitIdAndDeletedAtIsNull(Long traitId);

    boolean existsByTraitIdAndDeletedAtIsNull(Long traitId);

    Optional<TraitPlacement> findByMeasuredQualityIdAndTraitId(Long measuredQualityId, Long traitId);

    Optional<TraitPlacement> findByIdAndDeletedAtIsNull(Long id);

    /** Rows binned by one recycle-bin act (they share the deletedAt stamp) — restore support. */
    List<TraitPlacement> findByMeasuredQualityIdAndDeletedAt(Long measuredQualityId, java.time.OffsetDateTime deletedAt);

    List<TraitPlacement> findByParentIdAndDeletedAt(Long parentId, java.time.OffsetDateTime deletedAt);
}
