package com.bodhpsychometric.controller.demographics;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

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
        String otherOptionLabel = normalizedOtherOptionLabel(request);
        String problem = choiceProblem(request.fieldType(), options, otherOptionLabel);
        if (problem != null) {
            return badRequest(problem);
        }
        String label = request.label().trim();
        if (demographicFieldRepository.existsByLabelIgnoreCase(label)) {
            return duplicateLabel();
        }
        DemographicField field = new DemographicField();
        apply(field, request, options, otherOptionLabel);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(DemographicFieldResponse.from(demographicFieldRepository.save(field)));
    }

    /**
     * Answers freeze a field's SHAPE (V39 plan, risks 6 and 7): its type can
     * no longer change, and a choice somebody picked can no longer be renamed
     * or removed. Both store the choice's TEXT on the answer row, so a rename
     * would leave old answers pointing at a choice that no longer exists — and
     * on a checklist, whose export has one column per choice, those ticks
     * would silently drop out of the sheet. Adding and reordering choices stay
     * free, as does everything about a field nobody has answered yet.
     */
    @PutMapping("/update/{id}")
    public ResponseEntity<?> updateDemographicField(@PathVariable Long id,
            @Valid @RequestBody DemographicFieldRequest request) {
        List<String> options = normalizedOptions(request);
        String otherOptionLabel = normalizedOtherOptionLabel(request);
        String problem = choiceProblem(request.fieldType(), options, otherOptionLabel);
        if (problem != null) {
            return badRequest(problem);
        }
        DemographicField field = demographicFieldRepository.findById(id).orElse(null);
        if (field == null) {
            return ResponseEntity.notFound().build();
        }
        String label = request.label().trim();
        if (demographicFieldRepository.existsByLabelIgnoreCaseAndDemographicFieldIdNot(label, id)) {
            return duplicateLabel();
        }
        if (request.fieldType() != field.getFieldType()
                && demographicResponseRepository.existsByDemographicFieldDemographicFieldId(id)) {
            return conflict("This field already has answers, so its type can't be changed");
        }
        List<String> kept = new ArrayList<>(options);
        if (otherOptionLabel != null) {
            kept.add(otherOptionLabel);
        }
        List<String> dropped = field.choices().stream().filter(c -> !kept.contains(c)).toList();
        if (!dropped.isEmpty()) {
            Set<String> answered = new HashSet<>(demographicResponseRepository.findAnsweredValues(id));
            List<String> locked = dropped.stream().filter(answered::contains).toList();
            if (!locked.isEmpty()) {
                return conflict(locked.stream().map(c -> "\"" + c + "\"").collect(Collectors.joining(", "))
                        + (locked.size() == 1 ? " has answers, so it" : " have answers, so they")
                        + " can't be renamed or removed");
            }
        }
        apply(field, request, options, otherOptionLabel);
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
     * Trimmed, non-blank options for DROPDOWN and CHECKLIST; empty for every
     * other type. May come back empty for a choice type — choiceProblem says so.
     */
    private List<String> normalizedOptions(DemographicFieldRequest request) {
        if (!request.fieldType().hasChoices()) {
            return List.of();
        }
        return (request.options() == null ? List.<String>of() : request.options()).stream()
                .filter(o -> o != null && !o.isBlank())
                .map(String::trim)
                .toList();
    }

    /** The write-in label, trimmed; null when blank or the type has no choices. */
    private String normalizedOtherOptionLabel(DemographicFieldRequest request) {
        String label = request.otherOptionLabel();
        if (!request.fieldType().hasChoices() || label == null || label.isBlank()) {
            return null;
        }
        return label.trim();
    }

    /**
     * Why these choices cannot be saved, or null when they can.
     *
     * Options must differ ignoring case: a checklist stores each tick by its
     * text, and two options a reader cannot tell apart would be two columns
     * nobody can tell apart either. The write-in may not repeat an option for
     * the same reason. A checklist's choices become Data Studio column keys
     * (`[demo:7:opt:Laptop]`), and a formula's column reference ends at the
     * first ']', so a choice containing one could never be referenced.
     */
    private String choiceProblem(DemographicFieldType type, List<String> options, String otherOptionLabel) {
        if (!type.hasChoices()) {
            return null;
        }
        if (options.isEmpty()) {
            return "A " + type + " field needs at least one option";
        }
        Set<String> seen = new HashSet<>();
        for (String option : options) {
            if (!seen.add(option.toLowerCase(Locale.ROOT))) {
                return "\"" + option + "\" is listed twice — each option must be different";
            }
        }
        if (otherOptionLabel != null && seen.contains(otherOptionLabel.toLowerCase(Locale.ROOT))) {
            return "\"" + otherOptionLabel + "\" is already one of the options — remove that option or give"
                    + " the Other choice a different label";
        }
        if (type == DemographicFieldType.CHECKLIST) {
            boolean bracket = options.stream().anyMatch(o -> o.contains("]"))
                    || (otherOptionLabel != null && otherOptionLabel.contains("]"));
            if (bracket) {
                return "A checklist choice can't contain \"]\" — Data Studio formulas use it to end a column name";
            }
        }
        return null;
    }

    private void apply(DemographicField field, DemographicFieldRequest request, List<String> options,
            String otherOptionLabel) {
        field.setLabel(request.label().trim());
        field.setFieldType(request.fieldType());
        field.setPlaceholder(request.placeholder());
        field.getOptions().clear();
        field.getOptions().addAll(options);
        field.setOtherOptionLabel(otherOptionLabel);
    }

    private ResponseEntity<Map<String, String>> badRequest(String message) {
        return ResponseEntity.badRequest().body(Map.of("message", message));
    }

    private ResponseEntity<Map<String, String>> conflict(String message) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", message));
    }

    private ResponseEntity<Map<String, String>> duplicateLabel() {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "A field with this label already exists"));
    }
}
