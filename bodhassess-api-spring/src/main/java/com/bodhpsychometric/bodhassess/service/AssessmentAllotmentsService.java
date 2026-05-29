package com.bodhpsychometric.bodhassess.service;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.AssessmentEntityAllotment;
import com.bodhpsychometric.bodhassess.model.AssessmentEntityAllotmentId;
import com.bodhpsychometric.bodhassess.model.AssessmentGroupAllotment;
import com.bodhpsychometric.bodhassess.model.AssessmentGroupAllotmentId;
import com.bodhpsychometric.bodhassess.model.AssessmentRespondentAllotment;
import com.bodhpsychometric.bodhassess.model.AssessmentRespondentAllotmentId;
import com.bodhpsychometric.bodhassess.model.EntityRegistration;
import com.bodhpsychometric.bodhassess.payload.AssessmentAllotteesDto;
import com.bodhpsychometric.bodhassess.payload.AssessmentEntityAllotmentDto;
import com.bodhpsychometric.bodhassess.payload.AssessmentGroupAllotmentDto;
import com.bodhpsychometric.bodhassess.payload.AssessmentRespondentAllotmentDto;
import com.bodhpsychometric.bodhassess.repository.AssessmentEntityAllotmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentGroupAllotmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentRespondentAllotmentRepository;
import com.bodhpsychometric.bodhassess.repository.EntityRegistrationRepository;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;

/**
 * Manages the three allotee join tables for an Assessment. All mutating
 * calls audit through {@link AuditService}. Cap changes on entity
 * allotments are first-class events (ALLOTMENT_CAP_CHANGED).
 *
 * Group + respondent allotments don't carry caps per design — groups
 * always fan out to current members, individuals are 1:1.
 */
@Service
@Transactional
public class AssessmentAllotmentsService {

    @Autowired private AssessmentEntityAllotmentRepository entityAllotments;
    @Autowired private AssessmentGroupAllotmentRepository groupAllotments;
    @Autowired private AssessmentRespondentAllotmentRepository respondentAllotments;
    @Autowired private EntityRegistrationRepository entities;
    @Autowired private PortalSessionRepository sessions;
    @Autowired private AuditService audit;

    @Transactional(readOnly = true)
    public AssessmentAllotteesDto listAllotees(String assessmentId) {
        AssessmentAllotteesDto out = new AssessmentAllotteesDto();
        out.setAssessmentId(assessmentId);
        out.setEntities(entityAllotments.findByAssessmentId(assessmentId).stream()
                .map(this::toEntityDto).collect(java.util.stream.Collectors.toList()));
        out.setGroups(groupAllotments.findByAssessmentId(assessmentId).stream()
                .map(this::toGroupDto).collect(java.util.stream.Collectors.toList()));
        out.setRespondents(respondentAllotments.findByAssessmentId(assessmentId).stream()
                .map(this::toRespondentDto).collect(java.util.stream.Collectors.toList()));
        return out;
    }

    // ---------- Entity allotments (with cap) ----------

    public AssessmentEntityAllotmentDto addEntity(String assessmentId, String entityId, Integer cap) {
        if (!StringUtils.hasText(entityId)) throw new BadRequestException("entityId required");
        EntityRegistration ent = entities.findById(entityId)
                .orElseThrow(() -> new ResourceNotFoundException("Entity", "id", entityId));
        if (!ent.isActive()) {
            throw new BadRequestException("Entity " + entityId + " is not active. Activate it before allotting.");
        }
        if (cap != null && cap < 0) throw new BadRequestException("cap must be >= 0");

        AssessmentEntityAllotmentId pk = new AssessmentEntityAllotmentId(assessmentId, entityId);
        AssessmentEntityAllotment row = entityAllotments.findById(pk).orElseGet(AssessmentEntityAllotment::new);
        boolean isNew = row.getAssessmentId() == null;
        row.setAssessmentId(assessmentId);
        row.setEntityId(entityId);
        row.setCap(cap);
        AssessmentEntityAllotment saved = entityAllotments.save(row);

        Map<String, Object> snap = new HashMap<>();
        snap.put("assessmentId", assessmentId);
        snap.put("entityId", entityId);
        snap.put("cap", cap);
        audit.record(isNew ? "ALLOTMENT_ENTITY_ADDED" : "ALLOTMENT_ENTITY_UPDATED",
                "assessment_entity_allotment", assessmentId + ":" + entityId,
                null, snap);
        return toEntityDto(saved);
    }

    public AssessmentEntityAllotmentDto updateEntityCap(String assessmentId, String entityId, Integer cap) {
        AssessmentEntityAllotmentId pk = new AssessmentEntityAllotmentId(assessmentId, entityId);
        AssessmentEntityAllotment row = entityAllotments.findById(pk)
                .orElseThrow(() -> new ResourceNotFoundException("EntityAllotment", "(assessment,entity)", assessmentId + "," + entityId));
        Integer before = row.getCap();
        if (cap != null && cap < 0) throw new BadRequestException("cap must be >= 0");
        row.setCap(cap);
        AssessmentEntityAllotment saved = entityAllotments.save(row);
        Map<String, Object> b = new HashMap<>(); b.put("cap", before);
        Map<String, Object> a = new HashMap<>(); a.put("cap", cap);
        audit.record("ALLOTMENT_CAP_CHANGED",
                "assessment_entity_allotment", assessmentId + ":" + entityId, b, a);
        return toEntityDto(saved);
    }

    public void removeEntity(String assessmentId, String entityId) {
        AssessmentEntityAllotmentId pk = new AssessmentEntityAllotmentId(assessmentId, entityId);
        if (!entityAllotments.existsById(pk)) return;
        entityAllotments.deleteById(pk);
        audit.record("ALLOTMENT_ENTITY_REMOVED",
                "assessment_entity_allotment", assessmentId + ":" + entityId, null, null);
    }

    // ---------- Group allotments ----------

    public AssessmentGroupAllotmentDto addGroup(String assessmentId, String groupId) {
        if (!StringUtils.hasText(groupId)) throw new BadRequestException("groupId required");
        AssessmentGroupAllotmentId pk = new AssessmentGroupAllotmentId(assessmentId, groupId);
        if (groupAllotments.existsById(pk)) return toGroupDto(groupAllotments.findById(pk).get());
        AssessmentGroupAllotment row = new AssessmentGroupAllotment();
        row.setAssessmentId(assessmentId);
        row.setGroupId(groupId);
        AssessmentGroupAllotment saved = groupAllotments.save(row);
        audit.record("ALLOTMENT_GROUP_ADDED",
                "assessment_group_allotment", assessmentId + ":" + groupId, null, null);
        return toGroupDto(saved);
    }

    public void removeGroup(String assessmentId, String groupId) {
        AssessmentGroupAllotmentId pk = new AssessmentGroupAllotmentId(assessmentId, groupId);
        if (!groupAllotments.existsById(pk)) return;
        groupAllotments.deleteById(pk);
        audit.record("ALLOTMENT_GROUP_REMOVED",
                "assessment_group_allotment", assessmentId + ":" + groupId, null, null);
    }

    // ---------- Individual respondent allotments ----------

    public AssessmentRespondentAllotmentDto addRespondent(String assessmentId, String respondentId) {
        if (!StringUtils.hasText(respondentId)) throw new BadRequestException("respondentId required");
        AssessmentRespondentAllotmentId pk = new AssessmentRespondentAllotmentId(assessmentId, respondentId);
        if (respondentAllotments.existsById(pk)) return toRespondentDto(respondentAllotments.findById(pk).get());
        AssessmentRespondentAllotment row = new AssessmentRespondentAllotment();
        row.setAssessmentId(assessmentId);
        row.setRespondentId(respondentId);
        AssessmentRespondentAllotment saved = respondentAllotments.save(row);
        audit.record("ALLOTMENT_RESPONDENT_ADDED",
                "assessment_respondent_allotment", assessmentId + ":" + respondentId, null, null);
        return toRespondentDto(saved);
    }

    public void removeRespondent(String assessmentId, String respondentId) {
        AssessmentRespondentAllotmentId pk = new AssessmentRespondentAllotmentId(assessmentId, respondentId);
        if (!respondentAllotments.existsById(pk)) return;
        respondentAllotments.deleteById(pk);
        audit.record("ALLOTMENT_RESPONDENT_REMOVED",
                "assessment_respondent_allotment", assessmentId + ":" + respondentId, null, null);
    }

    // ---------- Mappers ----------

    private AssessmentEntityAllotmentDto toEntityDto(AssessmentEntityAllotment a) {
        AssessmentEntityAllotmentDto d = new AssessmentEntityAllotmentDto();
        d.setAssessmentId(a.getAssessmentId());
        d.setEntityId(a.getEntityId());
        d.setCap(a.getCap());
        // The entity *is* the company — the EntityRegistration.name field
        // actually holds the contact person's name. Prefer companyName as
        // the display label; fall back to name only for legacy rows that
        // were registered before companyName was required.
        entities.findById(a.getEntityId()).ifPresent(e -> {
            String label = e.getCompanyName();
            if (label == null || label.isEmpty()) label = e.getName();
            d.setEntityName(label);
        });
        d.setSessionsCount((int) sessions.countByAssessmentIdAndEntityId(a.getAssessmentId(), a.getEntityId()));
        // completedCount is left null for now — easy to add later if needed.
        if (a.getCreatedAt() != null) d.setCreatedAt(a.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        return d;
    }

    private AssessmentGroupAllotmentDto toGroupDto(AssessmentGroupAllotment a) {
        AssessmentGroupAllotmentDto d = new AssessmentGroupAllotmentDto();
        d.setAssessmentId(a.getAssessmentId());
        d.setGroupId(a.getGroupId());
        // Display name + member count are filled in by the controller
        // since groups live in a separate (frontend-only) store today.
        if (a.getCreatedAt() != null) d.setCreatedAt(a.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        return d;
    }

    private AssessmentRespondentAllotmentDto toRespondentDto(AssessmentRespondentAllotment a) {
        AssessmentRespondentAllotmentDto d = new AssessmentRespondentAllotmentDto();
        d.setAssessmentId(a.getAssessmentId());
        d.setRespondentId(a.getRespondentId());
        // Respondent name/email lookup is left to the controller (avoids
        // a tight coupling between this service and the respondents
        // module, which lives in another package).
        if (a.getCreatedAt() != null) d.setCreatedAt(a.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        return d;
    }

    @SuppressWarnings("unused")
    private static <T> List<T> emptyList() { return new ArrayList<>(); }
}
