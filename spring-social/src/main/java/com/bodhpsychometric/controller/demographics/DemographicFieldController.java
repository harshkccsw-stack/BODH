package com.bodhpsychometric.controller.demographics;

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

import com.bodhpsychometric.dto.DemographicFieldRequest;
import com.bodhpsychometric.dto.DemographicFieldResponse;
import com.bodhpsychometric.model.demographics.DemographicField;
import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;
import com.bodhpsychometric.repository.demographics.DemographicFieldRepository;
import com.bodhpsychometric.repository.demographics.DemographicResponseRepository;
import com.bodhpsychometric.repository.demographics.QuestionnaireDemographicFieldRepository;

import jakarta.validation.Valid;

/**
 * Registry CRUD for demographic fields — the dashboard's field library.
 * Which fields appear on which questionnaire (order, required) is the
 * QuestionnaireDemographicField mapping, a separate flow.
 *
 * Conflicts (duplicate label, delete-while-referenced) are PRE-checked with
 * exists queries rather than caught from the flush: inside a @Transactional
 * method a constraint violation marks the transaction rollback-only, so a
 * catch-and-return-409 would still die at commit with UnexpectedRollback.
 */
@RestController
@RequestMapping("/api/demographic-fields")
@Transactional
public class DemographicFieldController {

    @Autowired
    private DemographicFieldRepository demographicFieldRepository;

    @Autowired
    private QuestionnaireDemographicFieldRepository questionnaireDemographicFieldRepository;

    @Autowired
    private DemographicResponseRepository demographicResponseRepository;

    // A field edit changes every questionnaire form that maps it, so update
    // evicts their Redis content entries. Delete needs no hook: a mapped
    // field cannot be deleted (the 409 below), so a delete never touches
    // delivered content.
    @Autowired
    private com.bodhpsychometric.service.PortalContentService portalContentService;

    @GetMapping("/getAll")
    public List<DemographicFieldResponse> getAllDemographicFields() {
        return demographicFieldRepository.findAll().stream()
                .map(DemographicFieldResponse::from)
                .toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<DemographicFieldResponse> getDemographicFieldById(@PathVariable Long id) {
        return demographicFieldRepository.findById(id)
                .map(f -> ResponseEntity.ok(DemographicFieldResponse.from(f)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    public ResponseEntity<?> createDemographicField(@Valid @RequestBody DemographicFieldRequest request) {
        List<String> options = normalizedOptions(request);
        if (options == null) {
            return dropdownNeedsOptions();
        }
        String label = request.label().trim();
        if (demographicFieldRepository.existsByLabelIgnoreCase(label)) {
            return duplicateLabel();
        }
        DemographicField field = new DemographicField();
        apply(field, request, options);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(DemographicFieldResponse.from(demographicFieldRepository.save(field)));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<?> updateDemographicField(@PathVariable Long id,
            @Valid @RequestBody DemographicFieldRequest request) {
        List<String> options = normalizedOptions(request);
        if (options == null) {
            return dropdownNeedsOptions();
        }
        DemographicField field = demographicFieldRepository.findById(id).orElse(null);
        if (field == null) {
            return ResponseEntity.notFound().build();
        }
        String label = request.label().trim();
        if (demographicFieldRepository.existsByLabelIgnoreCaseAndDemographicFieldIdNot(label, id)) {
            return duplicateLabel();
        }
        apply(field, request, options);
        portalContentService.evictForDemographicField(id);
        return ResponseEntity.ok(DemographicFieldResponse.from(demographicFieldRepository.save(field)));
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteDemographicField(@PathVariable Long id) {
        if (!demographicFieldRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        if (questionnaireDemographicFieldRepository.existsByDemographicFieldDemographicFieldId(id)
                || demographicResponseRepository.existsByDemographicFieldDemographicFieldId(id)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "This field is in use by a questionnaire or has responses and cannot be deleted"));
        }
        demographicFieldRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Trimmed, non-blank options for DROPDOWN; empty for every other type.
     * Returns null when a DROPDOWN has no usable options (caller 400s).
     */
    private List<String> normalizedOptions(DemographicFieldRequest request) {
        if (request.fieldType() != DemographicFieldType.DROPDOWN) {
            return List.of();
        }
        List<String> cleaned = (request.options() == null ? List.<String>of() : request.options()).stream()
                .filter(o -> o != null && !o.isBlank())
                .map(o -> o.trim())
                .toList();
        return cleaned.isEmpty() ? null : cleaned;
    }

    private void apply(DemographicField field, DemographicFieldRequest request, List<String> options) {
        field.setLabel(request.label().trim());
        field.setFieldType(request.fieldType());
        field.setPlaceholder(request.placeholder());
        field.getOptions().clear();
        field.getOptions().addAll(options);
    }

    private ResponseEntity<Map<String, String>> dropdownNeedsOptions() {
        return ResponseEntity.badRequest()
                .body(Map.of("message", "A DROPDOWN field needs at least one option"));
    }

    private ResponseEntity<Map<String, String>> duplicateLabel() {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "A field with this label already exists"));
    }
}
