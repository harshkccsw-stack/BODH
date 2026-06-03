package com.bodhpsychometric.bodhassess.service;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.Assessment;
import com.bodhpsychometric.bodhassess.model.AssessmentEntityAllotment;
import com.bodhpsychometric.bodhassess.model.AssessmentGroupAllotment;
import com.bodhpsychometric.bodhassess.model.AssessmentRespondentAllotment;
import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaire;
import com.bodhpsychometric.bodhassess.payload.AssessmentDto;
import com.bodhpsychometric.bodhassess.payload.AssessmentEntityAllotmentDto;
import com.bodhpsychometric.bodhassess.repository.AssessmentEntityAllotmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentGroupAllotmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentRespondentAllotmentRepository;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;
import com.bodhpsychometric.bodhassess.repository.PublishedQuestionnaireRepository;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/**
 * CRUD for the first-class Assessment plus its initial allotments. Most
 * mutating methods route through {@link AuditService} so admin actions
 * leave a trail. Cap enforcement on (entity, assessment) sessions lives
 * here too.
 *
 * Status transitions are all reversible (ACTIVE/CLOSED/PAUSED) per the
 * design — the service just validates the target value and audits the
 * change.
 */
@Service
@Transactional
public class AssessmentService {

    private static final Set<String> VALID_STATUSES = new HashSet<>(java.util.Arrays.asList(
            "ACTIVE", "CLOSED", "PAUSED"));

    @Autowired private AssessmentRepository repo;
    @Autowired private AssessmentEntityAllotmentRepository entityAllotments;
    @Autowired private AssessmentGroupAllotmentRepository groupAllotments;
    @Autowired private AssessmentRespondentAllotmentRepository respondentAllotments;
    @Autowired private PublishedQuestionnaireRepository questionnaireRepo;
    @Autowired private PortalSessionRepository sessionRepo;

    @Autowired private SessionProvisioningService sessionProvisioning;
    @Autowired private AuditService audit;

    @Transactional(readOnly = true)
    public List<AssessmentDto> list() {
        return repo.findAllOrderByCreated().stream().map(this::toDtoWithCounts).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public AssessmentDto get(String id) {
        return toDtoWithCounts(loadOrThrow(id));
    }

    public AssessmentDto create(AssessmentDto dto) {
        if (!StringUtils.hasText(dto.getName())) {
            throw new BadRequestException("name is required");
        }
        if (!StringUtils.hasText(dto.getQuestionnaireId())) {
            throw new BadRequestException("questionnaireId is required");
        }
        // An assessment is pinned to a committed VERSION (a
        // PublishedQuestionnaire row), not the parent questionnaire family.
        // The create form sends the version in questionnaireVersionId; fall
        // back to questionnaireId for legacy callers that passed a published
        // id directly.
        String versionId = StringUtils.hasText(dto.getQuestionnaireVersionId())
                ? dto.getQuestionnaireVersionId()
                : dto.getQuestionnaireId();
        PublishedQuestionnaire q = questionnaireRepo.findById(versionId)
                .orElseThrow(() -> new BadRequestException("Unknown questionnaireVersionId: " + versionId));

        Assessment a = new Assessment();
        a.setId(StringUtils.hasText(dto.getId())
                ? dto.getId()
                : "AS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        a.setName(dto.getName().trim());
        // Parent family id for grouping; version id is what drives content
        // and scoring for respondents.
        a.setQuestionnaireId(StringUtils.hasText(q.getParentId()) ? q.getParentId() : q.getId());
        a.setQuestionnaireVersionId(q.getId());
        // Cache display fields so list views don't need to join.
        a.setQuestionnaireName(q.getName());
        a.setVertical(StringUtils.hasText(dto.getVertical()) ? dto.getVertical() : q.getVertical());
        a.setLanguage(StringUtils.hasText(dto.getLanguage()) ? dto.getLanguage() : "English");
        a.setStatus(StringUtils.hasText(dto.getStatus()) ? normaliseStatus(dto.getStatus()) : "ACTIVE");
        a.setCreatedBy(currentActorId());
        Assessment saved = repo.save(a);

        // Initial allotments — admin picks entities (with caps), groups,
        // and individual respondents on the create form. We persist them
        // inline so the one-shot create form behaves like before.
        if (dto.getEntityAllotments() != null) {
            for (AssessmentEntityAllotmentDto e : dto.getEntityAllotments()) {
                if (!StringUtils.hasText(e.getEntityId())) continue;
                AssessmentEntityAllotment row = new AssessmentEntityAllotment();
                row.setAssessmentId(saved.getId());
                row.setEntityId(e.getEntityId());
                row.setCap(e.getCap());
                row.setCreatedBy(currentActorId());
                entityAllotments.save(row);
                // Materialise sessions for the entity's members (up to the cap)
                // so they appear in those respondents' portals.
                sessionProvisioning.provisionEntity(saved.getId(), e.getEntityId());
            }
        }
        if (dto.getGroupAllotments() != null) {
            for (String gid : dto.getGroupAllotments()) {
                if (!StringUtils.hasText(gid)) continue;
                AssessmentGroupAllotment row = new AssessmentGroupAllotment();
                row.setAssessmentId(saved.getId());
                row.setGroupId(gid);
                row.setCreatedBy(currentActorId());
                groupAllotments.save(row);
                // Materialise a session for every group member.
                sessionProvisioning.provisionGroup(saved.getId(), gid);
            }
        }
        if (dto.getRespondentAllotments() != null) {
            for (String rid : dto.getRespondentAllotments()) {
                if (!StringUtils.hasText(rid)) continue;
                AssessmentRespondentAllotment row = new AssessmentRespondentAllotment();
                row.setAssessmentId(saved.getId());
                row.setRespondentId(rid);
                row.setCreatedBy(currentActorId());
                respondentAllotments.save(row);
                // Materialise the respondent's portal_session so the
                // assessment is visible/launchable in their portal — an
                // allotment row alone is not.
                sessionProvisioning.provisionRespondent(saved, rid);
            }
        }

        audit.record("ASSESSMENT_CREATED", "assessment", saved.getId(), null, toAuditSnapshot(saved));
        return toDtoWithCounts(saved);
    }

    public AssessmentDto update(String id, AssessmentDto dto) {
        Assessment a = loadOrThrow(id);
        Map<String, Object> before = toAuditSnapshot(a);
        if (StringUtils.hasText(dto.getName())) a.setName(dto.getName().trim());
        if (StringUtils.hasText(dto.getLanguage())) a.setLanguage(dto.getLanguage());
        // Vertical is normally derived from the questionnaire — allow
        // overriding only if explicitly passed.
        if (StringUtils.hasText(dto.getVertical())) a.setVertical(dto.getVertical());
        Assessment saved = repo.save(a);
        audit.record("ASSESSMENT_UPDATED", "assessment", saved.getId(), before, toAuditSnapshot(saved));
        return toDtoWithCounts(saved);
    }

    /**
     * Reversible state transition: ACTIVE / CLOSED / PAUSED. The previous
     * state is captured in the audit log so the admin can see exactly
     * who paused and when. Respondents are blocked from new sessions
     * (PAUSED) or any session (CLOSED) by the cap-enforcement path —
     * existing in-progress sessions stay viewable.
     */
    public AssessmentDto updateStatus(String id, String status) {
        if (!StringUtils.hasText(status)) {
            throw new BadRequestException("status is required");
        }
        String next = normaliseStatus(status);
        Assessment a = loadOrThrow(id);
        if (next.equals(a.getStatus())) return toDtoWithCounts(a);
        String prev = a.getStatus();
        a.setStatus(next);
        Assessment saved = repo.save(a);
        Map<String, String> before = new HashMap<>(); before.put("status", prev);
        Map<String, String> after = new HashMap<>(); after.put("status", next);
        audit.record("ASSESSMENT_STATUS_CHANGED", "assessment", saved.getId(), before, after);
        return toDtoWithCounts(saved);
    }

    public void delete(String id) {
        Assessment a = repo.findById(id).orElse(null);
        if (a == null) return;
        // Defensive: remove the join rows first so we don't leave orphans
        // (we don't have FK cascades wired between assessments and the
        // three allotment tables yet).
        entityAllotments.findByAssessmentId(id).forEach(entityAllotments::delete);
        groupAllotments.findByAssessmentId(id).forEach(groupAllotments::delete);
        respondentAllotments.findByAssessmentId(id).forEach(respondentAllotments::delete);
        repo.delete(a);
        audit.record("ASSESSMENT_DELETED", "assessment", id, toAuditSnapshot(a), null);
    }

    /**
     * True when count(sessions for (assessment, entity)) + delta would
     * exceed the per-pair cap. Null cap means unlimited. Used by the
     * invite / send flow to refuse a fan-out that would breach the cap.
     */
    @Transactional(readOnly = true)
    public boolean wouldExceedEntityCap(String assessmentId, String entityId, int extra) {
        AssessmentEntityAllotment al = entityAllotments
                .findById(new com.bodhpsychometric.bodhassess.model.AssessmentEntityAllotmentId(assessmentId, entityId))
                .orElse(null);
        if (al == null || al.getCap() == null) return false;
        long used = sessionRepo.countByAssessmentIdAndEntityId(assessmentId, entityId);
        return used + extra > al.getCap();
    }

    // ---------- helpers ----------

    private Assessment loadOrThrow(String id) {
        return repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Assessment", "id", id));
    }

    private AssessmentDto toDtoWithCounts(Assessment a) {
        AssessmentDto d = new AssessmentDto();
        d.setId(a.getId());
        d.setName(a.getName());
        d.setQuestionnaireId(a.getQuestionnaireId());
        d.setQuestionnaireVersionId(a.getQuestionnaireVersionId());
        d.setQuestionnaireName(a.getQuestionnaireName());
        d.setVertical(a.getVertical());
        d.setLanguage(a.getLanguage());
        d.setStatus(a.getStatus());
        d.setCreatedBy(a.getCreatedBy());
        if (a.getCreatedAt() != null) d.setCreatedAt(a.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        if (a.getUpdatedAt() != null) d.setUpdatedAt(a.getUpdatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        // Aggregate counts so the All Assessments table renders without
        // extra round-trips. Sessions tally lives on portal_sessions.
        d.setEntityCount(entityAllotments.findByAssessmentId(a.getId()).size());
        d.setGroupCount(groupAllotments.findByAssessmentId(a.getId()).size());
        d.setRespondentCount(respondentAllotments.findByAssessmentId(a.getId()).size());
        long sessions = sessionRepo.countByAssessmentId(a.getId());
        long completed = sessionRepo.countByAssessmentIdAndStatus(a.getId(), "Completed");
        d.setSessionsCount((int) sessions);
        d.setCompletedCount((int) completed);
        // Allotment lists left empty on the list view — see /allotees endpoint for the full list.
        d.setEntityAllotments(new ArrayList<>());
        d.setGroupAllotments(new ArrayList<>());
        d.setRespondentAllotments(new ArrayList<>());
        return d;
    }

    private Map<String, Object> toAuditSnapshot(Assessment a) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", a.getId());
        m.put("name", a.getName());
        m.put("questionnaireId", a.getQuestionnaireId());
        m.put("vertical", a.getVertical());
        m.put("language", a.getLanguage());
        m.put("status", a.getStatus());
        return m;
    }

    private String normaliseStatus(String s) {
        String up = s.trim().toUpperCase();
        if (!VALID_STATUSES.contains(up)) {
            throw new BadRequestException("status must be one of: ACTIVE, CLOSED, PAUSED");
        }
        return up;
    }

    private String currentActorId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof UserPrincipal)) return null;
        return ((UserPrincipal) auth.getPrincipal()).getId();
    }
}
