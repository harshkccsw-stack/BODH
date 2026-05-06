package com.bodhpsychometric.bodhassess.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.exception.UnauthorizedAccessException;
import com.bodhpsychometric.bodhassess.model.Practitioner;
import com.bodhpsychometric.bodhassess.payload.LoginRequest;
import com.bodhpsychometric.bodhassess.payload.PractitionerDto;
import com.bodhpsychometric.bodhassess.payload.PractitionerLoginResponse;
import com.bodhpsychometric.bodhassess.repository.PractitionerRepository;
import com.bodhpsychometric.bodhassess.repository.RoleRepository;
import com.bodhpsychometric.bodhassess.security.TokenProvider;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
@Transactional
public class PractitionersService {

    @Autowired
    private PractitionerRepository repo;

    @Autowired
    private RoleRepository roleRepo;

    @Autowired
    private TokenProvider tokenProvider;

    @Autowired
    private ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public List<PractitionerDto> list() {
        return repo.findAllOrderByCreatedAt().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public PractitionerDto get(String id) {
        return toDto(repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Practitioner", "id", id)));
    }

    public PractitionerDto create(PractitionerDto dto) {
        if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getName()) || !StringUtils.hasText(dto.getEmail())) {
            throw new BadRequestException("id, name, and email are required");
        }
        Practitioner p = repo.findById(dto.getId()).orElseGet(Practitioner::new);
        p.setId(dto.getId());
        p.setName(dto.getName().trim());
        p.setEmail(dto.getEmail().trim());
        List<String> roles = (dto.getRoles() == null || dto.getRoles().isEmpty())
                ? new ArrayList<>(Arrays.asList("Practitioner"))
                : new ArrayList<>(dto.getRoles());
        p.setRoles(roles);
        p.setVerticals(dto.getVerticals() == null ? new ArrayList<>() : new ArrayList<>(dto.getVerticals()));
        p.setStatus(StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : "Active");
        p.setLastLogin(dto.getLastLogin());
        p.setDob(StringUtils.hasText(dto.getDob()) ? LocalDate.parse(dto.getDob()) : null);
        return toDto(repo.save(p));
    }

    public PractitionerDto update(String id, PractitionerDto dto) {
        Practitioner p = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Practitioner", "id", id));
        if (StringUtils.hasText(dto.getName())) p.setName(dto.getName());
        if (StringUtils.hasText(dto.getEmail())) p.setEmail(dto.getEmail());
        if (dto.getRoles() != null) p.setRoles(new ArrayList<>(dto.getRoles()));
        if (dto.getVerticals() != null) p.setVerticals(new ArrayList<>(dto.getVerticals()));
        if (StringUtils.hasText(dto.getStatus())) p.setStatus(dto.getStatus());
        if (StringUtils.hasText(dto.getLastLogin())) p.setLastLogin(dto.getLastLogin());
        if (StringUtils.hasText(dto.getDob())) p.setDob(LocalDate.parse(dto.getDob()));
        return toDto(repo.save(p));
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    public PractitionerLoginResponse login(LoginRequest req) {
        if (!StringUtils.hasText(req.getId()) || !StringUtils.hasText(req.getDob())) {
            throw new BadRequestException("id and dob required");
        }
        LocalDate dob;
        try { dob = LocalDate.parse(req.getDob()); }
        catch (Exception e) { throw new BadRequestException("dob must be YYYY-MM-DD"); }

        Practitioner p = repo.findActiveByIdAndDob(req.getId().trim(), dob)
                .orElseThrow(() -> new UnauthorizedAccessException("invalid credentials"));

        List<String> urlPaths = urlPathsForRoles(p.getRoles());

        String token = tokenProvider.createToken(p.getId(), p.getEmail(),
                UserPrincipal.UserType.PRACTITIONER, p.getRoles());

        PractitionerLoginResponse.PractitionerMe me = new PractitionerLoginResponse.PractitionerMe();
        copyTo(me, toDto(p));
        me.setUrlPaths(urlPaths);
        return new PractitionerLoginResponse(token, me);
    }

    public PractitionerLoginResponse.PractitionerMe me(UserPrincipal principal) {
        if (principal == null) throw new UnauthorizedAccessException("token required");
        if (principal.getUserType() != UserPrincipal.UserType.PRACTITIONER) {
            throw new UnauthorizedAccessException("not a practitioner token");
        }
        Practitioner p = repo.findById(principal.getId())
                .orElseThrow(() -> new UnauthorizedAccessException("practitioner not found"));
        PractitionerLoginResponse.PractitionerMe me = new PractitionerLoginResponse.PractitionerMe();
        copyTo(me, toDto(p));
        me.setUrlPaths(urlPathsForRoles(p.getRoles()));
        return me;
    }

    private List<String> urlPathsForRoles(List<String> roleNames) {
        if (roleNames == null || roleNames.isEmpty()) return new ArrayList<>();
        List<String> jsons = roleRepo.findUrlPathsJsonByRoleNames(roleNames);
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        for (String raw : jsons) {
            if (raw == null || raw.isEmpty()) continue;
            try {
                List<String> arr = objectMapper.readValue(raw, new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
                seen.addAll(arr);
            } catch (Exception ignored) { }
        }
        return new ArrayList<>(seen);
    }

    private PractitionerDto toDto(Practitioner p) {
        PractitionerDto d = new PractitionerDto();
        d.setId(p.getId());
        d.setName(p.getName());
        d.setEmail(p.getEmail());
        d.setRoles(p.getRoles() == null ? new ArrayList<>() : new ArrayList<>(p.getRoles()));
        d.setVerticals(p.getVerticals() == null ? new ArrayList<>() : new ArrayList<>(p.getVerticals()));
        d.setStatus(p.getStatus());
        d.setLastLogin(p.getLastLogin());
        d.setDob(p.getDob() == null ? null : p.getDob().toString());
        return d;
    }

    private void copyTo(PractitionerDto target, PractitionerDto src) {
        target.setId(src.getId());
        target.setName(src.getName());
        target.setEmail(src.getEmail());
        target.setRoles(src.getRoles());
        target.setVerticals(src.getVerticals());
        target.setStatus(src.getStatus());
        target.setLastLogin(src.getLastLogin());
        target.setDob(src.getDob());
    }
}
