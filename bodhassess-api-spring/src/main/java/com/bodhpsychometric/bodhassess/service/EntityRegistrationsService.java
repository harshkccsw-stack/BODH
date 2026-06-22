package com.bodhpsychometric.bodhassess.service;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.AssessmentEntityAllotment;
import com.bodhpsychometric.bodhassess.model.EntityRegistration;
import com.bodhpsychometric.bodhassess.model.PortalSession;
import com.bodhpsychometric.bodhassess.payload.EntityRegistrationDto;
import com.bodhpsychometric.bodhassess.repository.AssessmentEntityAllotmentRepository;
import com.bodhpsychometric.bodhassess.repository.EntityRegistrationRepository;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;
import com.bodhpsychometric.bodhassess.repository.UserRepository;

@Service
@Transactional
public class EntityRegistrationsService {

    @Autowired
    private EntityRegistrationRepository repo;

    @Autowired
    private UserRepository users;

    // Assessment assignment from the Entity Management "Access" modal reuses
    // the allotment machinery so members get real portal sessions.
    @Autowired
    private AssessmentAllotmentsService allotments;

    @Autowired
    private PortalSessionRepository sessions;

    // The authoritative entity↔assessment link. The page count and the Access
    // modal's tick state are derived from this join (not the denormalised
    // entity_assessments allow-list) so they reflect access however it was
    // granted — and drop automatically when an assessment is deleted.
    @Autowired
    private AssessmentEntityAllotmentRepository entityAllotments;

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
        if (dto.getVerticals() != null) e.setVerticals(new HashSet<>(dto.getVerticals()));
        if (dto.getPlatformModules() != null) e.setPlatformModules(new HashSet<>(dto.getPlatformModules()));
        if (dto.getAssessments() != null) e.setAssessments(new HashSet<>(dto.getAssessments()));
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
            Set<String> oldMembers = e.getMemberIds() == null ? new HashSet<>() : new HashSet<>(e.getMemberIds());
            Set<String> newMembers = new HashSet<>(dto.getMemberIds());
            e.setMemberIds(newMembers);
            syncMemberEntities(e.getId(), oldMembers, newMembers);
        }
        // Verticals / platform modules remain plain stored allow-lists; null
        // means "don't touch".
        if (dto.getVerticals() != null) e.setVerticals(new HashSet<>(dto.getVerticals()));
        if (dto.getPlatformModules() != null) e.setPlatformModules(new HashSet<>(dto.getPlatformModules()));
        // Assessments is an active assignment, not just a flag: reconcile the
        // entity's allotments so members gain/lose real portal sessions.
        if (dto.getAssessments() != null) {
            reconcileAssessmentAssignments(e, new HashSet<>(dto.getAssessments()));
        }
        return toDto(repo.save(e));
    }

    /**
     * Make the entity's assessment allotments match {@code next}, the set of
     * assessment-record ids ticked in the Access modal:
     *
     *  • added   → allot the entity to the assessment (this materialises a
     *              session for every current member, up to the cap). The
     *              allotment call requires the entity to be active.
     *  • removed → drop the allotment and delete the entity's pending
     *              (not-yet-started) sessions for that assessment, leaving any
     *              started/completed work intact.
     *
     * Runs inside adminUpdate's transaction, so a failure (e.g. assigning to
     * an inactive entity) rolls the whole update back.
     */
    private void reconcileAssessmentAssignments(EntityRegistration e, Set<String> next) {
        // Diff against the authoritative allotment join, not the stored set —
        // otherwise an allotment created elsewhere (e.g. the assessment create
        // form) would be re-added or missed.
        Set<String> current = currentAssessmentIds(e.getId());
        for (String assessmentId : next) {
            if (!current.contains(assessmentId)) {
                // null cap = unlimited, so every member gets a session.
                allotments.addEntity(assessmentId, e.getId(), null);
            }
        }
        for (String assessmentId : current) {
            if (!next.contains(assessmentId)) {
                allotments.removeEntity(assessmentId, e.getId());
                deletePendingEntitySessions(assessmentId, e.getId());
            }
        }
        e.setAssessments(next);
    }

    /** The assessment ids this entity is actually allotted to — the
     *  authoritative source for both the page count and the Access modal. */
    private Set<String> currentAssessmentIds(String entityId) {
        return entityAllotments.findByEntityId(entityId).stream()
                .map(AssessmentEntityAllotment::getAssessmentId)
                .collect(Collectors.toCollection(HashSet::new));
    }

    /**
     * Delete the entity's sessions for an assessment that were never started
     * (status still "Active" and no startedAt). Started or completed sessions
     * are preserved so a respondent mid-assessment or with results isn't wiped.
     */
    private void deletePendingEntitySessions(String assessmentId, String entityId) {
        List<PortalSession> rows = sessions.findByAssessmentIdAndEntityId(assessmentId, entityId);
        List<PortalSession> pending = rows.stream()
                .filter(s -> s.getStartedAt() == null
                        && (s.getStatus() == null || "Active".equalsIgnoreCase(s.getStatus())))
                .collect(Collectors.toList());
        if (!pending.isEmpty()) sessions.deleteAll(pending);
    }

    /**
     * Keep the auth-side {@code user_entities} join in step with
     * {@code entity_members}. That join is the same mapping
     * IdentityBootstrapRunner rebuilds from entity members at startup; mirroring
     * it here means a member added/removed through the Members dialog is
     * reflected in the user's identity (the {@code entityIds} returned by
     * /auth/login and /me) immediately, not only after the next reboot.
     * Members without an app_users row are skipped.
     */
    private void syncMemberEntities(String entityId, Set<String> oldMembers, Set<String> newMembers) {
        for (String uid : newMembers) {
            if (oldMembers.contains(uid)) continue; // added
            users.findById(uid).ifPresent(u -> {
                if (u.getEntityIds() == null) u.setEntityIds(new HashSet<>());
                if (u.getEntityIds().add(entityId)) users.save(u);
            });
        }
        for (String uid : oldMembers) {
            if (newMembers.contains(uid)) continue; // removed
            users.findById(uid).ifPresent(u -> {
                if (u.getEntityIds() != null && u.getEntityIds().remove(entityId)) users.save(u);
            });
        }
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
        d.setVerticals(e.getVerticals() == null ? new ArrayList<>() : new ArrayList<>(e.getVerticals()));
        d.setPlatformModules(e.getPlatformModules() == null ? new ArrayList<>() : new ArrayList<>(e.getPlatformModules()));
        // Derive the assessment access list from the authoritative allotment
        // join rather than the stored entity_assessments set, so it reflects
        // every allotment (create form, All Assessments page, or Access modal)
        // and excludes assessments that have since been deleted.
        d.setAssessments(new ArrayList<>(currentAssessmentIds(e.getId())));
        if (e.getCreatedAt() != null) {
            d.setCreatedAt(e.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        }
        return d;
    }
}
