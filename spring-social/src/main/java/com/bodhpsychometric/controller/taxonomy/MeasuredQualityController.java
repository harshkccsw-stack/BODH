package com.bodhpsychometric.controller.taxonomy;

import java.util.List;

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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.MeasuredQualityRequest;
import com.bodhpsychometric.dto.MeasuredQualityResponse;
import com.bodhpsychometric.model.taxonomy.MeasuredQuality;
import com.bodhpsychometric.repository.measures.MeasuredQualityRepository;

import jakarta.validation.Valid;

/**
 * CRUD for Measured Qualities, backing the dashboard's Qualities page.
 * Takes and returns DTOs, never entities: @RequestBody binding needs a
 * stable payload shape, and serializing the entity would touch its lazy
 * types collection after the session closed (open-in-view is off).
 */
@RestController
@RequestMapping("/api/qualities")
@Transactional // responses build the MQT tree, which walks lazy collections
public class MeasuredQualityController {

    @Autowired
    private MeasuredQualityRepository measuredQualityRepository;

    @GetMapping("/getAll")
    public List<MeasuredQualityResponse> getAllMeasuredQualities() {
        return measuredQualityRepository.findAll().stream()
                .map(MeasuredQualityResponse::from)
                .toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<MeasuredQualityResponse> getMeasuredQualityById(@PathVariable Long id) {
        return measuredQualityRepository.findById(id)
                .map(mq -> ResponseEntity.ok(MeasuredQualityResponse.from(mq)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    @ResponseStatus(HttpStatus.CREATED)
    public MeasuredQualityResponse createMeasuredQuality(@Valid @RequestBody MeasuredQualityRequest request) {
        MeasuredQuality mq = new MeasuredQuality();
        mq.setName(request.name().trim());
        mq.setDescription(request.description());
        return MeasuredQualityResponse.from(measuredQualityRepository.save(mq));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<MeasuredQualityResponse> updateMeasuredQuality(@PathVariable Long id,
            @Valid @RequestBody MeasuredQualityRequest request) {
        return measuredQualityRepository.findById(id)
                .map(mq -> {
                    mq.setName(request.name().trim());
                    mq.setDescription(request.description());
                    return ResponseEntity.ok(MeasuredQualityResponse.from(measuredQualityRepository.save(mq)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<Void> deleteMeasuredQuality(@PathVariable Long id) {
        if (!measuredQualityRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        measuredQualityRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
