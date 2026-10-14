package com.bodhpsychometric.controller.demographics;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
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
import com.bodhpsychometric.model.question.enums.AnswerFormat;
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
        if (problem == null) {
            problem = rangeProblem(request);
        }
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
     * free, as does everything about a field nobody has answered yet. A
     * NUMBER field's range may change freely too, as long as every answer
     * already given still lies inside the new one.
     */
    @PutMapping("/update/{id}")
    public ResponseEntity<?> updateDemographicField(@PathVariable Long id,
            @Valid @RequestBody DemographicFieldRequest request) {
        List<String> options = normalizedOptions(request);
        String otherOptionLabel = normalizedOtherOptionLabel(request);
        String problem = choiceProblem(request.fieldType(), options, otherOptionLabel);
        if (problem == null) {
            problem = rangeProblem(request);
        }
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
        String outside = answersOutsideRange(field, request);
        if (outside != null) {
            return conflict(outside);
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

    /**
     * Why a NUMBER field's range cannot be saved, or null when it can — the
     * Number question's rule (QuestionController.rangeProblem): either end
     * may be left open, each is a whole number 0 … MAX_WHOLE_NUMBER (what the
     * answer itself may be), and set together To must be above From — a range
     * of one value is a question nobody needs to ask. Other types ignore both
     * ends, as they ignore options, and apply() clears them.
     */
    private String rangeProblem(DemographicFieldRequest request) {
        if (request.fieldType() != DemographicFieldType.NUMBER) {
            return null;
        }
        for (BigDecimal end : new BigDecimal[] { request.numberMin(), request.numberMax() }) {
            if (end != null && (end.stripTrailingZeros().scale() > 0 || end.signum() < 0
                    || end.compareTo(BigDecimal.valueOf(AnswerFormat.MAX_WHOLE_NUMBER)) > 0)) {
                return "The range's ends must be whole numbers from 0 to " + AnswerFormat.MAX_WHOLE_NUMBER;
            }
        }
        Long min = wholeEnd(request.numberMin());
        Long max = wholeEnd(request.numberMax());
        if (min != null && max != null && max <= min) {
            return "The range's To (" + max + ") must be greater than its From (" + min + ")";
        }
        return null;
    }

    /** A range end rangeProblem has passed, as the Long it is stored as; null stays null. */
    private static Long wholeEnd(BigDecimal end) {
        return end == null ? null : end.longValueExact();
    }

    /**
     * Why the requested range would strand answers already given, or null
     * when it would not: every stored value of a NUMBER field must still lie
     * inside the range, or the data would break the field's own rule. Only
     * looked up when the range actually changes. The values are distinct, so
     * this lists numbers, not people. Compared as BigDecimal because answers
     * stored before whole numbers were enforced may still be decimals.
     */
    private String answersOutsideRange(DemographicField field, DemographicFieldRequest request) {
        if (request.fieldType() != DemographicFieldType.NUMBER) {
            return null;
        }
        Long min = wholeEnd(request.numberMin());
        Long max = wholeEnd(request.numberMax());
        if (Objects.equals(field.getNumberMin(), min) && Objects.equals(field.getNumberMax(), max)) {
            return null;
        }
        List<BigDecimal> outside = demographicResponseRepository
                .findAnsweredValues(field.getDemographicFieldId()).stream()
                .map(DemographicFieldController::parseNumber)
                .filter(v -> v != null
                        && ((min != null && v.compareTo(BigDecimal.valueOf(min)) < 0)
                                || (max != null && v.compareTo(BigDecimal.valueOf(max)) > 0)))
                .sorted()
                .toList();
        if (outside.isEmpty()) {
            return null;
        }
        String shown = outside.stream().limit(3).map(BigDecimal::toPlainString)
                .collect(Collectors.joining(", "))
                + (outside.size() > 3 ? " and " + (outside.size() - 3) + " more" : "");
        return (outside.size() == 1 ? "An answer already given (" + shown + ") falls"
                : "Answers already given (" + shown + ") fall")
                + " outside a range " + AnswerFormat.rangePhrase(min, max) + " — keep every answer inside the range";
    }

    /** A stored answer as a number, or null for one that is not (none should be). */
    private static BigDecimal parseNumber(String value) {
        try {
            return value == null ? null : new BigDecimal(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private void apply(DemographicField field, DemographicFieldRequest request, List<String> options,
            String otherOptionLabel) {
        field.setLabel(request.label().trim());
        field.setFieldType(request.fieldType());
        field.setPlaceholder(request.placeholder());
        field.getOptions().clear();
        field.getOptions().addAll(options);
        field.setOtherOptionLabel(otherOptionLabel);
        boolean number = request.fieldType() == DemographicFieldType.NUMBER;
        field.setNumberMin(number ? wholeEnd(request.numberMin()) : null);
        field.setNumberMax(number ? wholeEnd(request.numberMax()) : null);
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
