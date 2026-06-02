package com.bodhpsychometric.bodhassess.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(PractitionersService.class);

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
        p.setPhone(StringUtils.hasText(dto.getPhone()) ? dto.getPhone().trim() : null);
        Set<String> roles = (dto.getRoles() == null || dto.getRoles().isEmpty())
                ? new HashSet<>(Arrays.asList("Practitioner"))
                : new HashSet<>(dto.getRoles());
        p.setRoles(roles);
        p.setVerticals(dto.getVerticals() == null ? new HashSet<>() : new HashSet<>(dto.getVerticals()));
        p.setStatus(StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : "Active");
        p.setLastLogin(dto.getLastLogin());
        p.setDob(StringUtils.hasText(dto.getDob()) ? LocalDate.parse(dto.getDob()) : null);
        return toDto(repo.save(p));
    }

    public PractitionerDto update(String id, PractitionerDto dto) {
        Practitioner p = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Practitioner", "id", id));
        if (StringUtils.hasText(dto.getName())) p.setName(dto.getName());
        if (StringUtils.hasText(dto.getEmail())) p.setEmail(dto.getEmail());
        if (dto.getPhone() != null) p.setPhone(dto.getPhone().trim().isEmpty() ? null : dto.getPhone().trim());
        if (dto.getRoles() != null) p.setRoles(new HashSet<>(dto.getRoles()));
        if (dto.getVerticals() != null) p.setVerticals(new HashSet<>(dto.getVerticals()));
        if (StringUtils.hasText(dto.getStatus())) p.setStatus(dto.getStatus());
        if (StringUtils.hasText(dto.getLastLogin())) p.setLastLogin(dto.getLastLogin());
        if (StringUtils.hasText(dto.getDob())) p.setDob(LocalDate.parse(dto.getDob()));
        return toDto(repo.save(p));
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    public PractitionerLoginResponse login(LoginRequest req) {
        String identifier = req.resolveIdentifier();
        if (identifier.isEmpty() || !StringUtils.hasText(req.getDob())) {
            throw new BadRequestException("identifier (email or phone) and dob required");
        }
        LocalDate dob;
        try { dob = LocalDate.parse(req.getDob()); }
        catch (Exception e) { throw new BadRequestException("dob must be YYYY-MM-DD"); }

        // [login-debug] Echo exactly what arrived. Remove once login is fixed.
        boolean byEmail = identifier.contains("@");
        log.info("[login-debug] practitioner login attempt: identifier='{}' (by{}), dob={}",
                identifier, byEmail ? "Email" : "Phone", dob);

        Practitioner p = null;
        if (byEmail) {
            p = repo.findActiveByEmailAndDob(identifier, dob).orElse(null);
        } else {
            String phoneDigits = identifier.replaceAll("\\D", "");
            if (!phoneDigits.isEmpty()) {
                for (Practitioner cand : repo.findActiveByDobWithPhone(dob)) {
                    String candDigits = cand.getPhone() == null ? "" : cand.getPhone().replaceAll("\\D", "");
                    if (!candDigits.isEmpty() && candDigits.equals(phoneDigits)) { p = cand; break; }
                }
            }
        }
        if (p == null) {
            // [login-debug] Explain WHY the match failed. For the email path we
            // can look the account up ignoring dob/status and compare fields.
            if (byEmail) {
                List<Practitioner> byEmailOnly = repo.findByEmailForDebug(identifier);
                if (byEmailOnly.isEmpty()) {
                    log.warn("[login-debug] FAIL: no practitioner with email '{}' exists in this DB", identifier);
                } else {
                    for (Practitioner cand : byEmailOnly) {
                        log.warn("[login-debug] FAIL: account found (id={}, storedEmail='{}') but did not match — "
                                + "storedDob={} vs typedDob={} (dobMatch={}), storedStatus='{}' (statusActive={})",
                                cand.getId(), cand.getEmail(), cand.getDob(), dob,
                                dob.equals(cand.getDob()), cand.getStatus(),
                                "Active".equalsIgnoreCase(cand.getStatus()));
                    }
                }
            } else {
                log.warn("[login-debug] FAIL: no Active practitioner with dob={} matched phone digits of '{}'",
                        dob, identifier);
            }
            throw new UnauthorizedAccessException("invalid credentials");
        }
        log.info("[login-debug] login OK: practitioner id={} email='{}' status='{}'",
                p.getId(), p.getEmail(), p.getStatus());

        List<String> urlPaths = urlPathsForRoles(p.getRoles());

        String token = tokenProvider.createToken(p.getId(), p.getEmail(),
                UserPrincipal.UserType.PRACTITIONER, new ArrayList<>(p.getRoles()));

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

    private List<String> urlPathsForRoles(Collection<String> roleNames) {
        if (roleNames == null || roleNames.isEmpty()) return new ArrayList<>();
        // Returns deduplicated URL paths flattened across all named roles —
        // the join query already does DISTINCT, but we preserve insertion
        // order with a LinkedHashSet just in case the driver isn't stable.
        return new ArrayList<>(new LinkedHashSet<>(roleRepo.findUrlPathsByRoleNames(roleNames)));
    }

    private PractitionerDto toDto(Practitioner p) {
        PractitionerDto d = new PractitionerDto();
        d.setId(p.getId());
        d.setName(p.getName());
        d.setEmail(p.getEmail());
        d.setPhone(p.getPhone());
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
        target.setPhone(src.getPhone());
        target.setRoles(src.getRoles());
        target.setVerticals(src.getVerticals());
        target.setStatus(src.getStatus());
        target.setLastLogin(src.getLastLogin());
        target.setDob(src.getDob());
    }
}
