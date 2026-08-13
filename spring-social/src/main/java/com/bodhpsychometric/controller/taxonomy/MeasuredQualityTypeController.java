package com.bodhpsychometric.controller.taxonomy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.MeasuredQualityTypeRequest;
import com.bodhpsychometric.dto.MqtNodeResponse;
import com.bodhpsychometric.model.taxonomy.MeasuredQuality;
import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;
import com.bodhpsychometric.repository.measures.MeasuredQualityRepository;
import com.bodhpsychometric.repository.measures.MeasuredQualityTypeRepository;
import com.bodhpsychometric.repository.scoring.OptionMqtScoreRepository;
import com.bodhpsychometric.repository.scoring.QuestionMqtScoreRepository;

import jakarta.validation.Valid;

/**
 * CRUD for MQT tree nodes. Create anchors a node either at an MQ's root
 * (measuredQualityId) or under a parent node (parentTypeId) — with a parent,
 * the MQ is taken from the parent, so the same-MQ rule cannot be broken.
 * Transactional at class level: the tree DTOs walk lazy collections.
 */
@RestController
@RequestMapping("/api/quality-types")
@Transactional
public class MeasuredQualityTypeController {

    /** Flat row for getAll — the nested view ships inside /api/qualities. */
    public record MqtFlat(Long measuredQualityTypeId, Long measuredQualityId, Long parentTypeId, String name) {
        static MqtFlat from(MeasuredQualityType t) {
            return new MqtFlat(
                    t.getMeasuredQualityTypeId(),
                    t.getMeasuredQuality().getMeasuredQualityId(),
                    t.getParent() == null ? null : t.getParent().getMeasuredQualityTypeId(),
                    t.getName());
        }
    }

    @Autowired
    private MeasuredQualityTypeRepository measuredQualityTypeRepository;

    @Autowired
    private MeasuredQualityRepository measuredQualityRepository;

    @Autowired
    private QuestionMqtScoreRepository questionMqtScoreRepository;

    @Autowired
    private OptionMqtScoreRepository optionMqtScoreRepository;

    @Autowired
    private com.bodhpsychometric.repository.scoring.QuestionRowMqtRepository questionRowMqtRepository;

    @GetMapping("/getAll")
    public List<MqtFlat> getAllQualityTypes() {
        return measuredQualityTypeRepository.findAll().stream().map(MqtFlat::from).toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<MqtNodeResponse> getQualityTypeById(@PathVariable Long id) {
        return measuredQualityTypeRepository.findById(id)
                .map(t -> ResponseEntity.ok(MqtNodeResponse.from(t)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    public ResponseEntity<MqtNodeResponse> createQualityType(@Valid @RequestBody MeasuredQualityTypeRequest request) {
        MeasuredQualityType node = new MeasuredQualityType();
        node.setName(request.name().trim());

        if (request.parentTypeId() != null) {
            // Sub-MQT: MQ comes from the parent, position after its siblings.
            MeasuredQualityType parent = measuredQualityTypeRepository.findById(request.parentTypeId()).orElse(null);
            if (parent == null) {
                return ResponseEntity.notFound().build();
            }
            node.setSortOrder(parent.getChildren().size());
            parent.addChild(node); // sets parent AND pins the child to the parent's MQ
        } else if (request.measuredQualityId() != null) {
            // Root MQT: position after the MQ's existing roots.
            MeasuredQuality mq = measuredQualityRepository.findById(request.measuredQualityId()).orElse(null);
            if (mq == null) {
                return ResponseEntity.notFound().build();
            }
            node.setSortOrder((int) mq.getTypes().stream().filter(MeasuredQualityType::isRoot).count());
            node.setMeasuredQuality(mq);
        } else {
            return ResponseEntity.badRequest().build(); // neither anchor given
        }

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(MqtNodeResponse.from(measuredQualityTypeRepository.save(node)));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<MqtNodeResponse> updateQualityType(@PathVariable Long id,
            @Valid @RequestBody MeasuredQualityTypeRequest request) {
        return measuredQualityTypeRepository.findById(id)
                .map(t -> {
                    t.setName(request.name().trim());
                    return ResponseEntity.ok(MqtNodeResponse.from(measuredQualityTypeRepository.save(t)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteQualityType(@PathVariable Long id) {
        MeasuredQualityType node = measuredQualityTypeRepository.findById(id).orElse(null);
        if (node == null) {
            return ResponseEntity.notFound().build();
        }
        // The delete cascades to the whole subtree, so ANY node under this one
        // that's still used in question/option scoring would trip an FK at
        // commit (500). Gather the subtree ids and pre-check; warn with a 409.
        List<Long> subtreeIds = new ArrayList<>();
        collectSubtreeIds(node, subtreeIds);
        if (questionMqtScoreRepository.existsByMeasuredQualityType_MeasuredQualityTypeIdIn(subtreeIds)
                || optionMqtScoreRepository.existsByMeasuredQualityType_MeasuredQualityTypeIdIn(subtreeIds)
                // Grid rows NOMINATE traits without scoring them — a third
                // place a trait can be in use, and just as able to trip the FK.
                || questionRowMqtRepository.existsByMeasuredQualityType_MeasuredQualityTypeIdIn(subtreeIds)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "message", "This quality type is in use by question scoring and can't be deleted."));
        }
        // Detach from the parent's collection so orphanRemoval and the direct
        // delete agree; children go with the node via cascade.
        if (node.getParent() != null) {
            node.getParent().removeChild(node);
        }
        measuredQualityTypeRepository.delete(node);
        return ResponseEntity.noContent().build();
    }

    /** This node's id plus every descendant's — the set the cascade would delete. */
    private void collectSubtreeIds(MeasuredQualityType node, List<Long> ids) {
        ids.add(node.getMeasuredQualityTypeId());
        for (MeasuredQualityType child : node.getChildren()) {
            collectSubtreeIds(child, ids);
        }
    }
}
