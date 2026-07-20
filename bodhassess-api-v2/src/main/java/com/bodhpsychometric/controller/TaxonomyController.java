package com.bodhpsychometric.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.repository.MeasuredQualityRepository;
import com.bodhpsychometric.repository.MeasuredQualityTraitRepository;
import com.bodhpsychometric.service.TaxonomyService;
import com.bodhpsychometric.model.taxonomy.MeasuredQuality;
import com.bodhpsychometric.model.taxonomy.MeasuredQualityTrait;
import com.bodhpsychometric.model.taxonomy.TraitPlacement;

@RestController
@RequestMapping("/api/v2/taxonomy")
public class TaxonomyController {

    public record NameDescription(String name, String description) {}
    public record PlaceTraitRequest(Long mqId, Long traitId, Long parentPlacementId, Integer sortOrder) {}
    public record MoveRequest(Long parentPlacementId, Integer sortOrder) {}

    public record MqDto(Long id, String name, String description) {
        static MqDto from(MeasuredQuality mq) {
            return new MqDto(mq.getId(), mq.getName(), mq.getDescription());
        }
    }

    public record TraitDto(Long id, String name, String description) {
        static TraitDto from(MeasuredQualityTrait t) {
            return new TraitDto(t.getId(), t.getName(), t.getDescription());
        }
    }

    public record PlacementNode(Long id, Long traitId, String traitName, int sortOrder,
                                List<PlacementNode> children) {
        static PlacementNode from(TraitPlacement p) {
            List<PlacementNode> children = p.getChildren().stream()
                    .filter(c -> !c.isDeleted())
                    .map(PlacementNode::from)
                    .toList();
            return new PlacementNode(p.getId(), p.getTrait().getId(), p.getTrait().getName(),
                    p.getSortOrder(), children);
        }
    }

    private final TaxonomyService taxonomy;
    private final MeasuredQualityRepository mqRepository;
    private final MeasuredQualityTraitRepository traitRepository;

    public TaxonomyController(TaxonomyService taxonomy,
                              MeasuredQualityRepository mqRepository,
                              MeasuredQualityTraitRepository traitRepository) {
        this.taxonomy = taxonomy;
        this.mqRepository = mqRepository;
        this.traitRepository = traitRepository;
    }

    // ── Measured qualities ───────────────────────────────────────────────

    @PostMapping("/mqs")
    @ResponseStatus(HttpStatus.CREATED)
    public MqDto createMq(@RequestBody NameDescription body) {
        return MqDto.from(taxonomy.createMeasuredQuality(body.name(), body.description()));
    }

    @GetMapping("/mqs")
    public List<MqDto> listMqs() {
        return mqRepository.findByDeletedAtIsNullOrderByNameAsc().stream().map(MqDto::from).toList();
    }

    @PutMapping("/mqs/{id}")
    public MqDto updateMq(@PathVariable Long id, @RequestBody NameDescription body) {
        return MqDto.from(taxonomy.updateMeasuredQuality(id, body.name(), body.description()));
    }

    @DeleteMapping("/mqs/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void binMq(@PathVariable Long id) {
        taxonomy.binMeasuredQuality(id);
    }

    @PostMapping("/mqs/{id}/restore")
    public void restoreMq(@PathVariable Long id) {
        taxonomy.restoreMeasuredQuality(id);
    }

    @GetMapping("/mqs/{id}/tree")
    public List<PlacementNode> tree(@PathVariable Long id) {
        return taxonomy.treeRoots(id).stream().map(PlacementNode::from).toList();
    }

    // ── Trait library ────────────────────────────────────────────────────

    @PostMapping("/traits")
    @ResponseStatus(HttpStatus.CREATED)
    public TraitDto createTrait(@RequestBody NameDescription body) {
        return TraitDto.from(taxonomy.createTrait(body.name(), body.description()));
    }

    @GetMapping("/traits")
    public List<TraitDto> listTraits(@RequestParam(required = false) String search) {
        List<MeasuredQualityTrait> traits = (search == null || search.isBlank())
                ? traitRepository.findByDeletedAtIsNullOrderByNameAsc()
                : traitRepository.findByNameContainingIgnoreCaseAndDeletedAtIsNull(search);
        return traits.stream().map(TraitDto::from).toList();
    }

    @PutMapping("/traits/{id}")
    public TraitDto updateTrait(@PathVariable Long id, @RequestBody NameDescription body) {
        return TraitDto.from(taxonomy.updateTrait(id, body.name(), body.description()));
    }

    @DeleteMapping("/traits/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void binTrait(@PathVariable Long id) {
        taxonomy.binTrait(id);
    }

    @PostMapping("/traits/{id}/restore")
    public void restoreTrait(@PathVariable Long id) {
        taxonomy.restoreTrait(id);
    }

    @GetMapping("/traits/{id}/where-used")
    public List<PlacementNode> whereUsed(@PathVariable Long id) {
        return taxonomy.whereUsed(id).stream().map(PlacementNode::from).toList();
    }

    // ── Placements ───────────────────────────────────────────────────────

    @PostMapping("/placements")
    @ResponseStatus(HttpStatus.CREATED)
    public PlacementNode place(@RequestBody PlaceTraitRequest body) {
        TraitPlacement placement = taxonomy.placeTrait(body.mqId(), body.traitId(),
                body.parentPlacementId(), body.sortOrder() == null ? 0 : body.sortOrder());
        return PlacementNode.from(placement);
    }

    @PutMapping("/placements/{id}/move")
    public PlacementNode move(@PathVariable Long id, @RequestBody MoveRequest body) {
        return PlacementNode.from(taxonomy.movePlacement(id, body.parentPlacementId(),
                body.sortOrder() == null ? 0 : body.sortOrder()));
    }

    @DeleteMapping("/placements/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void binPlacement(@PathVariable Long id) {
        taxonomy.binPlacementSubtree(id);
    }

    @PostMapping("/placements/{id}/restore")
    public void restorePlacement(@PathVariable Long id) {
        taxonomy.restorePlacementSubtree(id);
    }

    @DeleteMapping("/placements/{id}/permanent")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePlacement(@PathVariable Long id) {
        taxonomy.deletePlacementPermanently(id);
    }
}
