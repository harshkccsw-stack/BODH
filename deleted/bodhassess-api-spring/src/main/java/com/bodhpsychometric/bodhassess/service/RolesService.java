package com.bodhpsychometric.bodhassess.service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.Role;
import com.bodhpsychometric.bodhassess.payload.RoleDto;
import com.bodhpsychometric.bodhassess.repository.RoleRepository;

@Service
@Transactional
public class RolesService {

    @Autowired
    private RoleRepository repo;

    @Transactional(readOnly = true)
    public List<RoleDto> list() {
        return repo.findAllOrderByName().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public RoleDto get(String id) {
        return toDto(repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Role", "id", id)));
    }

    public RoleDto create(RoleDto dto) {
        if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getName())) {
            throw new BadRequestException("id and name are required");
        }
        Role r = repo.findById(dto.getId()).orElseGet(Role::new);
        r.setId(dto.getId());
        r.setName(dto.getName().trim());
        r.setDescription(dto.getDescription());
        r.setUrlPaths(dto.getUrlPaths() == null ? new java.util.HashSet<>() : new java.util.HashSet<>(dto.getUrlPaths()));
        return toDto(repo.save(r));
    }

    public RoleDto update(String id, RoleDto dto) {
        Role r = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Role", "id", id));
        if (StringUtils.hasText(dto.getName())) r.setName(dto.getName());
        r.setDescription(dto.getDescription());
        r.setUrlPaths(dto.getUrlPaths() == null ? new java.util.HashSet<>() : new java.util.HashSet<>(dto.getUrlPaths()));
        return toDto(repo.save(r));
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    private RoleDto toDto(Role r) {
        RoleDto d = new RoleDto();
        d.setId(r.getId());
        d.setName(r.getName());
        d.setDescription(r.getDescription());
        d.setUrlPaths(r.getUrlPaths() == null ? new ArrayList<>() : new ArrayList<>(r.getUrlPaths()));
        return d;
    }
}
