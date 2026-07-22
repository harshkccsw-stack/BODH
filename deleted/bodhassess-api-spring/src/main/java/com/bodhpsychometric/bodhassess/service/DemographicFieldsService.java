package com.bodhpsychometric.bodhassess.service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.model.DemographicField;
import com.bodhpsychometric.bodhassess.payload.DemographicFieldDto;
import com.bodhpsychometric.bodhassess.repository.DemographicFieldRepository;

@Service
@Transactional
public class DemographicFieldsService {

    @Autowired
    private DemographicFieldRepository repo;

    @Transactional(readOnly = true)
    public List<DemographicFieldDto> list(boolean activeOnly) {
        List<DemographicField> rows = activeOnly ? repo.findActiveOrdered() : repo.findAllOrdered();
        return rows.stream().map(this::toDto).collect(Collectors.toList());
    }

    public DemographicFieldDto upsert(DemographicFieldDto dto) {
        if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getFieldKey()) || !StringUtils.hasText(dto.getLabel())) {
            throw new BadRequestException("id, fieldKey, and label are required");
        }
        String type = dto.getType() == null ? "" : dto.getType().trim().toLowerCase();
        switch (type) {
            case "text": case "number": case "date": case "select": case "textarea":
                break;
            default:
                throw new BadRequestException("type must be one of: text, number, date, select, textarea");
        }
        DemographicField f = repo.findById(dto.getId()).orElseGet(DemographicField::new);
        f.setId(dto.getId());
        f.setFieldKey(dto.getFieldKey().trim());
        f.setLabel(dto.getLabel().trim());
        f.setType(type);
        f.setRequired(dto.isRequired());
        f.setPlaceholder(dto.getPlaceholder());
        f.setOptions(dto.getOptions() == null ? new java.util.HashSet<>() : new java.util.HashSet<>(dto.getOptions()));
        f.setSortOrder(dto.getSortOrder());
        f.setActive(dto.isActive());
        return toDto(repo.save(f));
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    private DemographicFieldDto toDto(DemographicField f) {
        DemographicFieldDto d = new DemographicFieldDto();
        d.setId(f.getId());
        d.setFieldKey(f.getFieldKey());
        d.setLabel(f.getLabel());
        d.setType(f.getType());
        d.setRequired(f.isRequired());
        d.setPlaceholder(f.getPlaceholder());
        d.setOptions(f.getOptions() == null ? new ArrayList<>() : new ArrayList<>(f.getOptions()));
        d.setSortOrder(f.getSortOrder());
        d.setActive(f.isActive());
        return d;
    }
}
