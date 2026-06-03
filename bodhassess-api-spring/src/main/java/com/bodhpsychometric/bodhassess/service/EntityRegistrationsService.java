package com.bodhpsychometric.bodhassess.service;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.EntityRegistration;
import com.bodhpsychometric.bodhassess.payload.EntityRegistrationDto;
import com.bodhpsychometric.bodhassess.repository.EntityRegistrationRepository;

@Service
@Transactional
public class EntityRegistrationsService {

    @Autowired
    private EntityRegistrationRepository repo;

    @Transactional(readOnly = true)
    public List<EntityRegistrationDto> list() {
        return repo.findAllOrderByCreatedAtDesc().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public EntityRegistrationDto get(String id) {
        return toDto(repo.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("EntityRegistration", "id", id)));
    }

    /**
     * Public self-registration. Requires name + email + dob — the same
     * required fields the admin-side "Add Respondent" form enforces. Email
     * is the de-facto unique key for self-signups; we reject duplicates so
     * the same person can't register multiple unmoderated rows.
     */
    public EntityRegistrationDto create(EntityRegistrationDto dto) {
        if (!StringUtils.hasText(dto.getName())
                || !StringUtils.hasText(dto.getCompanyName())
                || !StringUtils.hasText(dto.getEmail())
                || !StringUtils.hasText(dto.getPhone())
                || !StringUtils.hasText(dto.getDob())) {
            throw new BadRequestException("name, company name, email, phone, and dob are required");
        }
        String email = dto.getEmail().trim();
        if (repo.findByEmail(email).isPresent()) {
            throw new BadRequestException("This email is already registered.");
        }
        EntityRegistration e = new EntityRegistration();
        e.setId(StringUtils.hasText(dto.getId()) ? dto.getId() : "ER-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        e.setName(dto.getName().trim());
        e.setCompanyName(StringUtils.hasText(dto.getCompanyName()) ? dto.getCompanyName().trim() : null);
        e.setEmail(email);
        e.setPhone(StringUtils.hasText(dto.getPhone()) ? dto.getPhone().trim() : null);
        e.setDob(dto.getDob().trim());
        e.setSessionsCount(0);
        e.setAccountType(StringUtils.hasText(dto.getAccountType()) ? dto.getAccountType() : "individual");
        e.setOrgName(dto.getOrgName());
        e.setOrgWebsite(dto.getOrgWebsite());
        return toDto(repo.save(e));
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    /**
     * Admin-only PATCH-style update. Only fields present on the dto
     * change; a null means "don't touch" — so the dashboard can flip
     * `active` without re-sending the whole row, and the Members dialog
     * can replace memberIds without affecting active.
     *
     * For memberIds an explicit empty list IS meaningful (clear all
     * members); only `null` means "skip".
     *
     * NOTE: per-(entity, assessment) caps live on AssessmentEntityAllotment
     * now and are managed through the allotment endpoints, not here.
     */
    public EntityRegistrationDto adminUpdate(String id, EntityRegistrationDto dto) {
        EntityRegistration e = repo.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("EntityRegistration", "id", id));
        if (dto.getActive() != null) e.setActive(dto.getActive());
        if (dto.getMemberIds() != null) {
            e.setMemberIds(new HashSet<>(dto.getMemberIds()));
        }
        return toDto(repo.save(e));
    }

    private EntityRegistrationDto toDto(EntityRegistration e) {
        EntityRegistrationDto d = new EntityRegistrationDto();
        d.setId(e.getId());
        d.setName(e.getName());
        d.setCompanyName(e.getCompanyName());
        d.setEmail(e.getEmail());
        d.setPhone(e.getPhone());
        d.setDob(e.getDob());
        d.setSessionsCount(e.getSessionsCount());
        d.setLastAssessment(e.getLastAssessment());
        d.setAccountType(e.getAccountType());
        d.setOrgName(e.getOrgName());
        d.setOrgWebsite(e.getOrgWebsite());
        d.setActive(e.isActive());
        d.setMemberIds(e.getMemberIds() == null
                ? new ArrayList<>()
                : new ArrayList<>(e.getMemberIds()));
        if (e.getCreatedAt() != null) {
            d.setCreatedAt(e.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        }
        return d;
    }
}
