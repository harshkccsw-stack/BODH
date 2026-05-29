package com.bodhpsychometric.bodhassess.service;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.AssessmentToken;
import com.bodhpsychometric.bodhassess.payload.AssessmentTokenDto;
import com.bodhpsychometric.bodhassess.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentTokenRepository;
import com.bodhpsychometric.bodhassess.repository.EntityRegistrationRepository;
import com.bodhpsychometric.bodhassess.repository.RespondentGroupRepository;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/**
 * Issues + resolves the opaque registration tokens behind the
 * invite/copy-link popup. Tokens are 32 random bytes encoded as URL-safe
 * Base64 — no embedded JSON / no signing key needed, since the token is
 * just an opaque lookup key into the database.
 *
 * Token scope: assessmentId is always set. entityId, groupId, and
 * respondentId are optional and define what the registrant joins when
 * they consume the token. usedCount + maxUses cap how many registrations
 * a single link can produce; null maxUses = unlimited.
 */
@Service
@Transactional
public class AssessmentTokenService {

    private static final SecureRandom RNG = new SecureRandom();

    @Autowired private AssessmentTokenRepository tokens;
    @Autowired private AssessmentRepository assessments;
    @Autowired private EntityRegistrationRepository entities;
    @Autowired private RespondentGroupRepository groups;
    @Autowired private AuditService audit;

    public AssessmentTokenDto issue(AssessmentTokenDto req) {
        if (req.getAssessmentId() == null
                || !assessments.findById(req.getAssessmentId()).isPresent()) {
            throw new BadRequestException("Valid assessmentId required");
        }
        AssessmentToken t = new AssessmentToken();
        t.setToken(randomToken());
        t.setAssessmentId(req.getAssessmentId());
        t.setEntityId(req.getEntityId());
        t.setGroupId(req.getGroupId());
        t.setRespondentId(req.getRespondentId());
        t.setMaxUses(req.getMaxUses());
        t.setUsedCount(0);
        if (req.getExpiresAt() != null && !req.getExpiresAt().isEmpty()) {
            try { t.setExpiresAt(OffsetDateTime.parse(req.getExpiresAt())); }
            catch (Exception ex) {
                throw new BadRequestException("expiresAt must be ISO-8601");
            }
        }
        t.setCreatedBy(currentActorId());
        AssessmentToken saved = tokens.save(t);

        Map<String, Object> snap = new HashMap<>();
        snap.put("token", saved.getToken());
        snap.put("assessmentId", saved.getAssessmentId());
        snap.put("entityId", saved.getEntityId());
        snap.put("groupId", saved.getGroupId());
        snap.put("respondentId", saved.getRespondentId());
        audit.record("TOKEN_ISSUED", "assessment_token", saved.getToken(), null, snap);
        return toDto(saved);
    }

    /**
     * Public lookup — the /register page calls this to find out which
     * Assessment + context the token represents. Does NOT consume; just
     * reads. Rejects tokens that are expired or already at maxUses.
     */
    @Transactional(readOnly = true)
    public AssessmentTokenDto resolve(String token) {
        AssessmentToken t = tokens.findById(token)
                .orElseThrow(() -> new ResourceNotFoundException("AssessmentToken", "token", token));
        if (t.getExpiresAt() != null && t.getExpiresAt().isBefore(OffsetDateTime.now(ZoneOffset.UTC))) {
            throw new BadRequestException("Token expired");
        }
        if (t.getMaxUses() != null && t.getUsedCount() >= t.getMaxUses()) {
            throw new BadRequestException("Token has been used the maximum number of times");
        }
        // Enrich with display names so the anonymous /register page can show
        // the assessment + entity/group without calling auth-gated endpoints.
        AssessmentTokenDto dto = toDto(t);
        assessments.findById(t.getAssessmentId())
                .ifPresent(a -> dto.setAssessmentName(a.getName()));
        if (t.getEntityId() != null && !t.getEntityId().isEmpty()) {
            entities.findById(t.getEntityId()).ifPresent(e ->
                    dto.setEntityName(e.getCompanyName() != null && !e.getCompanyName().isEmpty()
                            ? e.getCompanyName() : e.getName()));
        }
        if (t.getGroupId() != null && !t.getGroupId().isEmpty()) {
            groups.findById(t.getGroupId()).ifPresent(g -> dto.setGroupName(g.getName()));
        }
        return dto;
    }

    /**
     * Increment usedCount after a successful registration. The /register
     * page calls this once the new respondent row is in place.
     */
    public AssessmentTokenDto consume(String token) {
        AssessmentToken t = tokens.findById(token)
                .orElseThrow(() -> new ResourceNotFoundException("AssessmentToken", "token", token));
        t.setUsedCount(t.getUsedCount() + 1);
        return toDto(tokens.save(t));
    }

    @Transactional(readOnly = true)
    public List<AssessmentTokenDto> listForAssessment(String assessmentId) {
        return tokens.findByAssessmentId(assessmentId).stream().map(this::toDto).collect(Collectors.toList());
    }

    public void revoke(String token) {
        if (tokens.existsById(token)) {
            tokens.deleteById(token);
            audit.record("TOKEN_REVOKED", "assessment_token", token, null, null);
        }
    }

    private String randomToken() {
        byte[] buf = new byte[32];
        RNG.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    private AssessmentTokenDto toDto(AssessmentToken t) {
        AssessmentTokenDto d = new AssessmentTokenDto();
        d.setToken(t.getToken());
        d.setAssessmentId(t.getAssessmentId());
        d.setEntityId(t.getEntityId());
        d.setGroupId(t.getGroupId());
        d.setRespondentId(t.getRespondentId());
        d.setMaxUses(t.getMaxUses());
        d.setUsedCount(t.getUsedCount());
        if (t.getExpiresAt() != null) d.setExpiresAt(t.getExpiresAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        if (t.getCreatedAt() != null) d.setCreatedAt(t.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        d.setCreatedBy(t.getCreatedBy());
        return d;
    }

    private String currentActorId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof UserPrincipal)) return null;
        return ((UserPrincipal) auth.getPrincipal()).getId();
    }
}
