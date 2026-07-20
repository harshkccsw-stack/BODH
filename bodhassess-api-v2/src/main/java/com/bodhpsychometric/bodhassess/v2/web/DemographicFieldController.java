package com.bodhpsychometric.bodhassess.v2.web;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.http.HttpStatus;
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

import com.bodhpsychometric.bodhassess.domain.assessment.DemographicField;
import com.bodhpsychometric.bodhassess.domain.assessment.DemographicFieldOption;
import com.bodhpsychometric.bodhassess.domain.assessment.DemographicFieldType;
import com.bodhpsychometric.repository.DemographicFieldRepository;
import com.bodhpsychometric.service.ConflictException;
import com.bodhpsychometric.service.NotFoundException;

/**
 * Registry admin for demographic fields. Simple enough that the controller
 * talks to the repository directly — no invariants beyond key uniqueness.
 */
@RestController
@RequestMapping("/api/v2/demographic-fields")
@Transactional
public class DemographicFieldController {

    public record FieldRequest(String fieldKey, String label, DemographicFieldType type,
                               boolean required, String placeholder, Boolean active,
                               List<String> options) {}

    public record FieldDto(Long id, String fieldKey, String label, DemographicFieldType type,
                           boolean required, String placeholder, boolean active, List<String> options) {
        static FieldDto from(DemographicField f) {
            return new FieldDto(f.getId(), f.getFieldKey(), f.getLabel(), f.getType(), f.isRequired(),
                    f.getPlaceholder(), f.isActive(),
                    f.getOptions().stream().map(DemographicFieldOption::getValue).toList());
        }
    }

    private final DemographicFieldRepository repository;

    public DemographicFieldController(DemographicFieldRepository repository) {
        this.repository = repository;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FieldDto create(@RequestBody FieldRequest body) {
        if (repository.existsByFieldKey(body.fieldKey())) {
            throw new ConflictException("fieldKey already exists: " + body.fieldKey());
        }
        DemographicField field = new DemographicField();
        field.setFieldKey(body.fieldKey());
        apply(field, body);
        return FieldDto.from(repository.save(field));
    }

    @PutMapping("/{id}")
    public FieldDto update(@PathVariable Long id, @RequestBody FieldRequest body) {
        DemographicField field = live(id);
        apply(field, body);   // fieldKey stays immutable — it's the stable identifier
        return FieldDto.from(field);
    }

    @GetMapping
    public List<FieldDto> list() {
        return repository.findByDeletedAtIsNullOrderByLabelAsc().stream().map(FieldDto::from).toList();
    }

    @GetMapping("/active")
    public List<FieldDto> active() {
        return repository.findByActiveTrueAndDeletedAtIsNullOrderByLabelAsc()
                .stream().map(FieldDto::from).toList();
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void bin(@PathVariable Long id) {
        live(id).moveToBin(OffsetDateTime.now());
    }

    @PostMapping("/{id}/restore")
    public void restore(@PathVariable Long id) {
        repository.findById(id)
                .orElseThrow(() -> new NotFoundException("DemographicField", id))
                .restoreFromBin();
    }

    private void apply(DemographicField field, FieldRequest body) {
        field.setLabel(body.label());
        field.setType(body.type());
        field.setRequired(body.required());
        field.setPlaceholder(body.placeholder());
        field.setActive(body.active() == null || body.active());
        field.getOptions().clear();
        int order = 0;
        for (String value : body.options() == null ? List.<String>of() : body.options()) {
            DemographicFieldOption option = new DemographicFieldOption();
            option.setValue(value);
            option.setSortOrder(order++);
            field.addOption(option);
        }
    }

    private DemographicField live(Long id) {
        return repository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("DemographicField", id));
    }
}
