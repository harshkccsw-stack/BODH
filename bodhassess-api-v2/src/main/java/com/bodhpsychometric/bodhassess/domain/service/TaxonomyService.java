package com.bodhpsychometric.bodhassess.domain.service;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.domain.repository.ItemUsageTraitScoreRepository;
import com.bodhpsychometric.bodhassess.domain.repository.MeasuredQualityRepository;
import com.bodhpsychometric.bodhassess.domain.repository.MeasuredQualityTraitRepository;
import com.bodhpsychometric.bodhassess.domain.repository.OptionUsageTraitScoreRepository;
import com.bodhpsychometric.bodhassess.domain.repository.SessionTraitScoreRepository;
import com.bodhpsychometric.bodhassess.domain.repository.TraitPlacementRepository;
import com.bodhpsychometric.bodhassess.domain.taxonomy.MeasuredQuality;
import com.bodhpsychometric.bodhassess.domain.taxonomy.MeasuredQualityTrait;
import com.bodhpsychometric.bodhassess.domain.taxonomy.TraitPlacement;

/**
 * The taxonomy rules that the mappings cannot express live here: same-MQ
 * parenting, acyclic trees, recycle-bin subtree cascades, and the
 * "psychometric history never loses its labels" guards (nothing referenced
 * by score rows is ever removed, only binned).
 */
@Service
@Transactional
public class TaxonomyService {

    private final MeasuredQualityRepository mqRepository;
    private final MeasuredQualityTraitRepository traitRepository;
    private final TraitPlacementRepository placementRepository;
    private final ItemUsageTraitScoreRepository itemUsageScoreRepository;
    private final OptionUsageTraitScoreRepository optionUsageScoreRepository;
    private final SessionTraitScoreRepository sessionTraitScoreRepository;

    public TaxonomyService(MeasuredQualityRepository mqRepository,
                           MeasuredQualityTraitRepository traitRepository,
                           TraitPlacementRepository placementRepository,
                           ItemUsageTraitScoreRepository itemUsageScoreRepository,
                           OptionUsageTraitScoreRepository optionUsageScoreRepository,
                           SessionTraitScoreRepository sessionTraitScoreRepository) {
        this.mqRepository = mqRepository;
        this.traitRepository = traitRepository;
        this.placementRepository = placementRepository;
        this.itemUsageScoreRepository = itemUsageScoreRepository;
        this.optionUsageScoreRepository = optionUsageScoreRepository;
        this.sessionTraitScoreRepository = sessionTraitScoreRepository;
    }

    // ── Measured qualities ───────────────────────────────────────────────

    public MeasuredQuality createMeasuredQuality(String name, String description) {
        MeasuredQuality mq = new MeasuredQuality();
        mq.setName(name);
        mq.setDescription(description);
        return mqRepository.save(mq);
    }

    public MeasuredQuality updateMeasuredQuality(Long id, String name, String description) {
        MeasuredQuality mq = liveMq(id);
        mq.setName(name);
        mq.setDescription(description);
        return mq;
    }

    /** Bins the MQ and its whole placement tree; the shared traits stay live. */
    public void binMeasuredQuality(Long id) {
        MeasuredQuality mq = liveMq(id);
        OffsetDateTime now = OffsetDateTime.now();
        mq.moveToBin(now);
        for (TraitPlacement placement : placementRepository.findByMeasuredQualityIdAndDeletedAtIsNull(id)) {
            placement.moveToBin(now);
        }
    }

    public void restoreMeasuredQuality(Long id) {
        MeasuredQuality mq = mqRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("MeasuredQuality", id));
        OffsetDateTime binnedAt = mq.getDeletedAt();
        mq.restoreFromBin();
        if (binnedAt == null) return;
        // Restore exactly the placements binned in the same act (shared stamp).
        for (TraitPlacement placement : placementRepository.findByMeasuredQualityIdAndDeletedAt(id, binnedAt)) {
            placement.restoreFromBin();
        }
    }

    // ── Trait library ────────────────────────────────────────────────────

    public MeasuredQualityTrait createTrait(String name, String description) {
        MeasuredQualityTrait trait = new MeasuredQualityTrait();  // names deliberately not unique
        trait.setName(name);
        trait.setDescription(description);
        return traitRepository.save(trait);
    }

    public MeasuredQualityTrait updateTrait(Long id, String name, String description) {
        MeasuredQualityTrait trait = liveTrait(id);
        trait.setName(name);
        trait.setDescription(description);
        return trait;
    }

    /** A trait can only be binned once no live placement uses it. */
    public void binTrait(Long id) {
        MeasuredQualityTrait trait = liveTrait(id);
        if (placementRepository.existsByTraitIdAndDeletedAtIsNull(id)) {
            throw new ConflictException("Trait " + id + " is still placed in one or more MQs — remove the placements first");
        }
        trait.moveToBin(OffsetDateTime.now());
    }

    public void restoreTrait(Long id) {
        traitRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("MeasuredQualityTrait", id))
                .restoreFromBin();
    }

    // ── Placements (the per-MQ tree of shared traits) ────────────────────

    public TraitPlacement placeTrait(Long mqId, Long traitId, Long parentPlacementId, int sortOrder) {
        MeasuredQuality mq = liveMq(mqId);
        MeasuredQualityTrait trait = liveTrait(traitId);
        placementRepository.findByMeasuredQualityIdAndTraitId(mqId, traitId).ifPresent(existing -> {
            throw new ConflictException("Trait " + traitId + " is already placed in MQ " + mqId
                    + (existing.isDeleted() ? " (in the recycle bin — restore it instead)" : ""));
        });

        TraitPlacement placement = new TraitPlacement();
        placement.setMeasuredQuality(mq);
        placement.setTrait(trait);
        placement.setSortOrder(sortOrder);
        if (parentPlacementId != null) {
            placement.setParent(requireSameMqParent(mqId, parentPlacementId));
        }
        return placementRepository.save(placement);
    }

    public TraitPlacement movePlacement(Long placementId, Long newParentPlacementId, int sortOrder) {
        TraitPlacement placement = livePlacement(placementId);
        placement.setSortOrder(sortOrder);
        if (newParentPlacementId == null) {
            placement.setParent(null);
            return placement;
        }
        TraitPlacement newParent = requireSameMqParent(placement.getMeasuredQuality().getId(), newParentPlacementId);
        // Acyclic guard: the new parent must not sit inside this placement's subtree.
        for (TraitPlacement cursor = newParent; cursor != null; cursor = cursor.getParent()) {
            if (cursor.getId().equals(placementId)) {
                throw new ValidationException("Moving placement " + placementId + " under " + newParentPlacementId
                        + " would create a cycle");
            }
        }
        placement.setParent(newParent);
        return placement;
    }

    /** Bins the placement and its whole subtree; historical score rows keep pointing at them. */
    public void binPlacementSubtree(Long placementId) {
        TraitPlacement root = livePlacement(placementId);
        binRecursively(root, OffsetDateTime.now());
    }

    public void restorePlacementSubtree(Long placementId) {
        TraitPlacement root = placementRepository.findById(placementId)
                .orElseThrow(() -> new NotFoundException("TraitPlacement", placementId));
        if (root.getParent() != null && root.getParent().isDeleted()) {
            throw new ConflictException("Restore the parent placement first");
        }
        OffsetDateTime binnedAt = root.getDeletedAt();
        restoreRecursively(root, binnedAt);
    }

    /** True hard-delete is allowed only for placements no score row ever referenced. */
    public void deletePlacementPermanently(Long placementId) {
        TraitPlacement placement = placementRepository.findById(placementId)
                .orElseThrow(() -> new NotFoundException("TraitPlacement", placementId));
        if (itemUsageScoreRepository.existsByPlacementId(placementId)
                || optionUsageScoreRepository.existsByPlacementId(placementId)
                || sessionTraitScoreRepository.existsByPlacementId(placementId)) {
            throw new ConflictException("Placement " + placementId
                    + " is referenced by scoring history and can only be binned");
        }
        if (!placementRepository.findByParentIdAndDeletedAtIsNullOrderBySortOrderAsc(placementId).isEmpty()) {
            throw new ConflictException("Placement " + placementId + " still has live children");
        }
        placementRepository.delete(placement);
    }

    // ── Reads ────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<TraitPlacement> treeRoots(Long mqId) {
        liveMq(mqId);
        return placementRepository.findByMeasuredQualityIdAndParentIsNullAndDeletedAtIsNullOrderBySortOrderAsc(mqId);
    }

    @Transactional(readOnly = true)
    public List<TraitPlacement> whereUsed(Long traitId) {
        return placementRepository.findByTraitIdAndDeletedAtIsNull(traitId);
    }

    // ── internals ────────────────────────────────────────────────────────

    private void binRecursively(TraitPlacement placement, OffsetDateTime when) {
        placement.moveToBin(when);
        for (TraitPlacement child : placementRepository
                .findByParentIdAndDeletedAtIsNullOrderBySortOrderAsc(placement.getId())) {
            binRecursively(child, when);
        }
    }

    private void restoreRecursively(TraitPlacement placement, OffsetDateTime binnedAt) {
        placement.restoreFromBin();
        if (binnedAt == null) return;
        for (TraitPlacement child : placementRepository.findByParentIdAndDeletedAt(placement.getId(), binnedAt)) {
            restoreRecursively(child, binnedAt);
        }
    }

    private TraitPlacement requireSameMqParent(Long mqId, Long parentPlacementId) {
        TraitPlacement parent = livePlacement(parentPlacementId);
        if (!mqId.equals(parent.getMeasuredQuality().getId())) {
            throw new ValidationException("Parent placement " + parentPlacementId
                    + " belongs to a different MQ than " + mqId);
        }
        return parent;
    }

    private MeasuredQuality liveMq(Long id) {
        return mqRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("MeasuredQuality", id));
    }

    private MeasuredQualityTrait liveTrait(Long id) {
        return traitRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("MeasuredQualityTrait", id));
    }

    private TraitPlacement livePlacement(Long id) {
        return placementRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("TraitPlacement", id));
    }
}
