package com.bodhpsychometric.bodhassess.service;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.RespondentGroup;
import com.bodhpsychometric.bodhassess.payload.GroupDto;
import com.bodhpsychometric.bodhassess.repository.RespondentGroupRepository;

@Service
@Transactional
public class GroupsService {

    @Autowired
    private RespondentGroupRepository repo;

    @Transactional(readOnly = true)
    public List<GroupDto> list() {
        return repo.findAllOrderByCreatedAt().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public GroupDto get(String id) {
        return toDto(repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Group", "id", id)));
    }

    public GroupDto create(GroupDto dto) {
        if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getName())) {
            throw new BadRequestException("id and name are required");
        }
        RespondentGroup g = repo.findById(dto.getId()).orElseGet(RespondentGroup::new);
        g.setId(dto.getId());
        g.setName(dto.getName().trim());
        g.setDescription(dto.getDescription());
        g.setParentId(dto.getParentId());
        g.setMemberIds(dto.getMemberIds() == null ? new HashSet<>() : new HashSet<>(dto.getMemberIds()));
        g.setAssignedInstruments(dto.getAssignedInstruments() == null ? new HashSet<>() : new HashSet<>(dto.getAssignedInstruments()));
        return toDto(repo.save(g));
    }

    public GroupDto update(String id, GroupDto dto) {
        RespondentGroup g = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Group", "id", id));
        if (StringUtils.hasText(dto.getName())) g.setName(dto.getName());
        g.setDescription(dto.getDescription());
        g.setParentId(dto.getParentId());
        g.setMemberIds(dto.getMemberIds() == null ? new HashSet<>() : new HashSet<>(dto.getMemberIds()));
        g.setAssignedInstruments(dto.getAssignedInstruments() == null ? new HashSet<>() : new HashSet<>(dto.getAssignedInstruments()));
        return toDto(repo.save(g));
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    private GroupDto toDto(RespondentGroup g) {
        GroupDto d = new GroupDto();
        d.setId(g.getId());
        d.setName(g.getName());
        d.setDescription(g.getDescription());
        d.setParentId(g.getParentId());
        d.setMemberIds(g.getMemberIds() == null ? new ArrayList<>() : new ArrayList<>(g.getMemberIds()));
        d.setAssignedInstruments(g.getAssignedInstruments() == null ? new ArrayList<>() : new ArrayList<>(g.getAssignedInstruments()));
        if (g.getCreatedAt() != null) d.setCreatedAt(g.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        return d;
    }
}
