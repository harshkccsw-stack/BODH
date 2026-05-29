package com.bodhpsychometric.bodhassess.service;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.Assessment;
import com.bodhpsychometric.bodhassess.model.AssessmentToken;
import com.bodhpsychometric.bodhassess.model.EntityRegistration;
import com.bodhpsychometric.bodhassess.model.PortalSession;
import com.bodhpsychometric.bodhassess.model.Respondent;
import com.bodhpsychometric.bodhassess.model.RespondentGroup;
import com.bodhpsychometric.bodhassess.payload.PublicRegistrationDto;
import com.bodhpsychometric.bodhassess.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentTokenRepository;
import com.bodhpsychometric.bodhassess.repository.EntityRegistrationRepository;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;
import com.bodhpsychometric.bodhassess.repository.RespondentGroupRepository;
import com.bodhpsychometric.bodhassess.repository.RespondentRepository;

/**
 * Single-call public registration. The /register page hits one endpoint
 * with the opaque token + the registrant's details, and the service:
 *
 *   1. Resolves and validates the token (expiry + maxUses)
 *   2. Reuses or creates a Respondent (pre-bound on the token wins)
 *   3. If the token carries an entityId, appends the respondent to the
 *      entity's member set (if not already present)
 *   4. Enforces the per-(entity, assessment) cap before creating the session
 *   5. Creates the PortalSession that the take-assessment flow renders
 *   6. Increments token.usedCount
 *
 * All steps happen in one @Transactional unit so a failure at any point
 * rolls back the partial state.
 */
@Service
@Transactional
public class PublicRegistrationService {

    @Autowired private AssessmentTokenRepository tokens;
    @Autowired private AssessmentRepository assessments;
    @Autowired private RespondentRepository respondents;
    @Autowired private EntityRegistrationRepository entities;
    @Autowired private RespondentGroupRepository groups;
    @Autowired private PortalSessionRepository sessions;
    @Autowired private AssessmentService assessmentService;

    public PublicRegistrationDto.Result register(String token, PublicRegistrationDto req) {
        if (req == null
                || !StringUtils.hasText(req.getName())
                || !StringUtils.hasText(req.getEmail())
                || !StringUtils.hasText(req.getDob())) {
            throw new BadRequestException("name, email, and dob are required");
        }

        AssessmentToken t = tokens.findById(token)
                .orElseThrow(() -> new ResourceNotFoundException("AssessmentToken", "token", token));
        if (t.getExpiresAt() != null && t.getExpiresAt().isBefore(OffsetDateTime.now(java.time.ZoneOffset.UTC))) {
            throw new BadRequestException("Token expired");
        }
        if (t.getMaxUses() != null && t.getUsedCount() >= t.getMaxUses()) {
            throw new BadRequestException("Token has been used the maximum number of times");
        }

        Assessment a = assessments.findById(t.getAssessmentId())
                .orElseThrow(() -> new ResourceNotFoundException("Assessment", "id", t.getAssessmentId()));

        // 1. Respondent — pre-bound on the token wins. Otherwise create a
        //    fresh row from the form input. We dedupe by (email, dob) so
        //    repeated links from the same person don't sprawl.
        String respondentId = t.getRespondentId();
        if (!StringUtils.hasText(respondentId)) {
            Optional<Respondent> existing = respondents.findByEmailAndDob(
                    req.getEmail().trim(), req.getDob().trim());
            Respondent r;
            if (existing.isPresent()) {
                r = existing.get();
            } else {
                r = new Respondent();
                r.setId("R-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
                r.setName(req.getName().trim());
                r.setEmail(req.getEmail().trim());
                r.setPhone(req.getPhone());
                r.setDob(req.getDob().trim());
                r.setConsent("Pending");
                r.setAccountType("individual");
                r = respondents.save(r);
            }
            respondentId = r.getId();
        }

        // 2. If the token has an entity, link the respondent into that
        //    entity's member set (idempotent).
        String entityName = null;
        if (StringUtils.hasText(t.getEntityId())) {
            EntityRegistration e = entities.findById(t.getEntityId())
                    .orElseThrow(() -> new ResourceNotFoundException("Entity", "id", t.getEntityId()));
            entityName = e.getCompanyName() != null && !e.getCompanyName().isEmpty()
                    ? e.getCompanyName() : e.getName();
            if (e.getMemberIds() == null) e.setMemberIds(new HashSet<>());
            if (!e.getMemberIds().contains(respondentId)) {
                e.getMemberIds().add(respondentId);
                entities.save(e);
            }
            // 3. Enforce the per-(entity, assessment) cap before creating
            //    a session — better here than after the row is inserted.
            if (assessmentService.wouldExceedEntityCap(a.getId(), t.getEntityId(), 1)) {
                throw new BadRequestException(
                        "This assessment's cap for the entity has been reached. Please contact the administrator.");
            }
        }

        // 2b. If the token has a group, link the respondent into that
        //     group's member set as well (idempotent).
        if (StringUtils.hasText(t.getGroupId())) {
            RespondentGroup g = groups.findById(t.getGroupId())
                    .orElseThrow(() -> new ResourceNotFoundException("Group", "id", t.getGroupId()));
            if (g.getMemberIds() == null) g.setMemberIds(new HashSet<>());
            if (!g.getMemberIds().contains(respondentId)) {
                g.getMemberIds().add(respondentId);
                groups.save(g);
            }
        }

        // 4. Create the session. Status "Active" + minimal fields — the
        //    take-assessment flow fills the rest.
        PortalSession s = new PortalSession();
        s.setId("SESS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        s.setAssessmentId(a.getId());
        s.setName(a.getName());
        s.setRespondentId(respondentId);
        s.setRespondentName(req.getName().trim());
        s.setRespondentEmail(req.getEmail().trim());
        s.setInstrument(a.getQuestionnaireName());
        s.setInstrumentFullName(a.getQuestionnaireName());
        s.setVertical(a.getVertical());
        s.setLanguage(a.getLanguage() != null ? a.getLanguage() : "English");
        s.setStatus("Active");
        s.setScore("--");
        if (StringUtils.hasText(t.getEntityId())) {
            s.setEntityId(t.getEntityId());
            s.setEntityName(entityName);
        }
        PortalSession savedSession = sessions.save(s);

        // 5. Consume the token (++usedCount). We persist with the
        //    pre-incremented value so retries surface the cap immediately.
        t.setUsedCount(t.getUsedCount() + 1);
        tokens.save(t);

        return new PublicRegistrationDto.Result(savedSession.getId(), respondentId, a.getId());
    }
}
