package com.bodhpsychometric.bodhassess.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.Vertical;
import com.bodhpsychometric.bodhassess.payload.VerticalDto;
import com.bodhpsychometric.bodhassess.repository.VerticalRepository;

@Service
@Transactional
public class VerticalsService {

    @Autowired
    private VerticalRepository repo;

    @Transactional(readOnly = true)
    public List<VerticalDto> list() {
        return repo.findAllOrderByName().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public VerticalDto get(String id) {
        return toDto(repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Vertical", "id", id)));
    }

    public VerticalDto create(VerticalDto dto) {
        if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getCode()) || !StringUtils.hasText(dto.getName())) {
            throw new BadRequestException("id, code, and name are required");
        }
        Vertical v = repo.findById(dto.getId()).orElseGet(Vertical::new);
        v.setId(dto.getId());
        v.setCode(dto.getCode().trim().toUpperCase());
        v.setName(dto.getName().trim());
        v.setDescription(dto.getDescription());
        return toDto(repo.save(v));
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    private VerticalDto toDto(Vertical v) {
        VerticalDto d = new VerticalDto();
        d.setId(v.getId());
        d.setCode(v.getCode());
        d.setName(v.getName());
        d.setDescription(v.getDescription());
        return d;
    }
}
