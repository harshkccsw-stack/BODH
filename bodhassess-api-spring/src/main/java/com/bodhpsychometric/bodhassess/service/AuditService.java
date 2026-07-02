package com.bodhpsychometric.bodhassess.service;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.model.AuditLogEntry;
import com.bodhpsychometric.bodhassess.payload.AuditLogEntryDto;
import com.bodhpsychometric.bodhassess.repository.AuditLogRepository;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Centralised audit logger. Services call {@link #record} after a
 * change; the entry is persisted with the current admin principal as
 * the actor. Read APIs serve per-target history for the entity /
 * assessment drill-in tabs.
 */
@Service
@Transactional
public class AuditService {

    @Autowired private AuditLogRepository repo;
    @Autowired private ObjectMapper mapper;

    public void record(String action, String targetType, String targetId,
                       Object before, Object after) {
        AuditLogEntry e = new AuditLogEntry();
        UserPrincipal p = currentPrincipal();
        if (p != null) {
            e.setActorId(p.getId());
            e.setActorName(p.getEmail() != null ? p.getEmail() : p.getId());
        }
        e.setAction(action);
        e.setTargetType(targetType);
        e.setTargetId(targetId);
        e.setBeforeJson(asJson(before));
        e.setAfterJson(asJson(after));
        repo.save(e);
    }

    @Transactional(readOnly = true)
    public List<AuditLogEntryDto> listForTarget(String targetType, String targetId) {
        return repo.findByTarget(targetType, targetId).stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<AuditLogEntryDto> listAll() {
        return repo.findAllRecent().stream().map(this::toDto).collect(Collectors.toList());
    }

    private UserPrincipal currentPrincipal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof UserPrincipal)) return null;
        return (UserPrincipal) auth.getPrincipal();
    }

    private String asJson(Object o) {
        if (o == null) return null;
        try { return mapper.writeValueAsString(o); }
        catch (JsonProcessingException e) { return String.valueOf(o); }
    }

    private AuditLogEntryDto toDto(AuditLogEntry e) {
        AuditLogEntryDto d = new AuditLogEntryDto();
        d.setId(e.getId());
        d.setActorId(e.getActorId());
        d.setActorName(e.getActorName());
        d.setAction(e.getAction());
        d.setTargetType(e.getTargetType());
        d.setTargetId(e.getTargetId());
        d.setBeforeJson(e.getBeforeJson());
        d.setAfterJson(e.getAfterJson());
        if (e.getCreatedAt() != null) {
            d.setCreatedAt(e.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        }
        return d;
    }
}
