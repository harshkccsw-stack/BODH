package com.bodhpsychometric.bodhassess.service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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
import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaire;
import com.bodhpsychometric.bodhassess.model.Questionnaire;
import com.bodhpsychometric.bodhassess.payload.CommitVersionRequest;
import com.bodhpsychometric.bodhassess.payload.CreateDraftRequest;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireDto;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireParentDto;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireVersionSummaryDto;
import com.bodhpsychometric.bodhassess.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.repository.PublishedQuestionnaireRepository;
import com.bodhpsychometric.bodhassess.repository.QuestionnaireRepository;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/**
 * Git-style versioning service for questionnaires.
 *
 *   - Parent CRUD (Question Bank list view).
 *   - Draft lifecycle: create (blank or branched), edit content,
 *     commit (DRAFT → COMMITTED with semver bump), or discard.
 *   - Set-current pointer that defaults the assessment-create version
 *     picker without touching existing assessments.
 *
 * Content edits on drafts delegate to {@link QuestionnairesService} —
 * it already knows how to materialise the MQ tree, questions, options,
 * scores, and demographic keys from JSON. We just enforce status=DRAFT
 * before letting it run.
 *
 * Every mutation routes through {@link AuditService} with one of the
 * QUESTIONNAIRE_* / VERSION_* action codes.
 */
@Service
@Transactional
public class QuestionnaireVersioningService {

    @Autowired private QuestionnaireRepository parents;
    @Autowired private PublishedQuestionnaireRepository versions;
    @Autowired private AssessmentRepository assessments;
    @Autowired private QuestionnairesService content;
    @Autowired private AuditService audit;

    // ---------------- Parents ----------------

    @Transactional(readOnly = true)
    public List<QuestionnaireParentDto> listParents() {
        return parents.findAllOrderByCreated().stream()
                .map(p -> toParentDto(p, /*withVersions=*/ false))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public QuestionnaireParentDto getParent(String id) {
        Questionnaire p = parents.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Questionnaire", "id", id));
        return toParentDto(p, /*withVersions=*/ true);
    }

    /**
     * Create a fresh Questionnaire family. The first row is a DRAFT —
     * admin fills the content + commits it to materialise v1.0.
     */
    public QuestionnaireParentDto createParent(QuestionnaireParentDto dto) {
        if (!StringUtils.hasText(dto.getName())) {
            throw new BadRequestException("name is required");
        }
        Questionnaire p = new Questionnaire();
        p.setId("Q-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        p.setName(dto.getName().trim());
        p.setVertical(dto.getVertical());
        p.setCreatedBy(currentActorId());
        Questionnaire saved = parents.save(p);

        // Initial DRAFT so the editor opens on something. Blank
        // content; admin shapes it before committing.
        PublishedQuestionnaire draft = newDraft(saved.getId(), null);
        versions.save(draft);

        audit.record("QUESTIONNAIRE_CREATED", "questionnaire", saved.getId(), null, snapshotParent(saved));
        return toParentDto(saved, true);
    }

    public QuestionnaireParentDto updateParent(String id, QuestionnaireParentDto dto) {
        Questionnaire p = parents.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Questionnaire", "id", id));
        Map<String, Object> before = snapshotParent(p);
        if (StringUtils.hasText(dto.getName())) p.setName(dto.getName().trim());
        if (dto.getVertical() != null) p.setVertical(dto.getVertical());
        Questionnaire saved = parents.save(p);
        audit.record("QUESTIONNAIRE_UPDATED", "questionnaire", saved.getId(), before, snapshotParent(saved));
        return toParentDto(saved, true);
    }

    public void deleteParent(String id) {
        Questionnaire p = parents.findById(id).orElse(null);
        if (p == null) return;
        // Defensive: only allow deletion when no assessment pins any of
        // the versions. Avoids orphaning live respondent data.
        for (PublishedQuestionnaire v : versions.findByParent(id)) {
            long inUse = assessments.countByQuestionnaireVersionId(v.getId());
            if (inUse > 0) {
                throw new BadRequestException(
                        "Cannot delete: version " + v.getVersionLabel()
                        + " is locked in by " + inUse + " assessment(s).");
            }
            versions.delete(v);
        }
        parents.delete(p);
        audit.record("QUESTIONNAIRE_DELETED", "questionnaire", id, snapshotParent(p), null);
    }

    /**
     * Move the parent's current_version_id. The target must be a
     * COMMITTED row under this parent. Existing Assessments are
     * untouched.
     */
    public QuestionnaireParentDto setCurrentVersion(String parentId, String versionId) {
        Questionnaire p = parents.findById(parentId)
                .orElseThrow(() -> new ResourceNotFoundException("Questionnaire", "id", parentId));
        PublishedQuestionnaire v = versions.findById(versionId)
                .orElseThrow(() -> new ResourceNotFoundException("Version", "id", versionId));
        if (!Objects.equals(v.getParentId(), parentId)) {
            throw new BadRequestException("Version " + versionId + " does not belong to " + parentId);
        }
        if (!"COMMITTED".equals(v.getVersionStatus())) {
            throw new BadRequestException("Only COMMITTED versions can be set as current.");
        }
        String prev = p.getCurrentVersionId();
        p.setCurrentVersionId(versionId);
        Questionnaire saved = parents.save(p);
        Map<String, String> before = new HashMap<>(); before.put("currentVersionId", prev);
        Map<String, String> after  = new HashMap<>(); after.put("currentVersionId", versionId);
        audit.record("VERSION_SET_CURRENT", "questionnaire", parentId, before, after);
        return toParentDto(saved, true);
    }

    // ---------------- Versions ----------------

    @Transactional(readOnly = true)
    public List<QuestionnaireVersionSummaryDto> listVersions(String parentId, boolean committedOnly) {
        Questionnaire p = parents.findById(parentId)
                .orElseThrow(() -> new ResourceNotFoundException("Questionnaire", "id", parentId));
        List<PublishedQuestionnaire> rows = committedOnly
                ? versions.findCommittedByParent(parentId)
                : versions.findByParent(parentId);
        return rows.stream().map(v -> toVersionSummary(v, p.getCurrentVersionId())).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public QuestionnaireDto getVersionContent(String versionId) {
        // Existence check first; the rich DTO mapper assumes the row is
        // there and would throw a less specific error otherwise.
        if (!versions.existsById(versionId)) {
            throw new ResourceNotFoundException("Version", "id", versionId);
        }
        // Reuse the existing rich DTO mapper — it builds the MQ tree,
        // questions, options, scores from the persisted children.
        return content.get(versionId);
    }

    /**
     * Create a fresh draft. branchedFromVersionId may be null (blank
     * draft) or point at an existing COMMITTED row to clone.
     */
    public QuestionnaireVersionSummaryDto createDraft(String parentId, CreateDraftRequest req) {
        Questionnaire p = parents.findById(parentId)
                .orElseThrow(() -> new ResourceNotFoundException("Questionnaire", "id", parentId));
        PublishedQuestionnaire draft;
        if (req != null && StringUtils.hasText(req.getBranchedFromVersionId())) {
            PublishedQuestionnaire base = versions.findById(req.getBranchedFromVersionId())
                    .orElseThrow(() -> new ResourceNotFoundException("Version", "id", req.getBranchedFromVersionId()));
            if (!Objects.equals(base.getParentId(), parentId)) {
                throw new BadRequestException("Cannot branch from a version of a different questionnaire.");
            }
            if (!"COMMITTED".equals(base.getVersionStatus())) {
                throw new BadRequestException("Drafts can only be branched from a COMMITTED version.");
            }
            draft = cloneAsDraft(base);
        } else {
            draft = newDraft(parentId, null);
        }
        if (req != null && StringUtils.hasText(req.getInitialName())) {
            draft.setVersionName(req.getInitialName().trim());
        }
        PublishedQuestionnaire saved = versions.save(draft);
        audit.record(
                req != null && StringUtils.hasText(req.getBranchedFromVersionId())
                        ? "VERSION_DRAFT_BRANCHED"
                        : "VERSION_DRAFT_CREATED",
                "questionnaire_version", saved.getId(),
                null, snapshotVersion(saved));
        return toVersionSummary(saved, p.getCurrentVersionId());
    }

    /**
     * Update DRAFT content. Reuses {@link QuestionnairesService#upsert}
     * (which understands the MQ tree / questions JSON shapes) after
     * asserting status=DRAFT.
     */
    public QuestionnaireDto updateDraftContent(String versionId, QuestionnaireDto dto) {
        PublishedQuestionnaire v = versions.findById(versionId)
                .orElseThrow(() -> new ResourceNotFoundException("Version", "id", versionId));
        if (!"DRAFT".equals(v.getVersionStatus())) {
            throw new BadRequestException("Only DRAFT versions can be edited. Create a new draft to change a committed version.");
        }
        // Force the id on the dto so QuestionnairesService.upsert lands
        // on this draft row rather than creating a new one.
        dto.setId(versionId);
        return content.upsert(dto);
    }

    /**
     * Commit a draft. Computes the next semver label from the parent's
     * latest COMMITTED row, fills the audit fields, and (if requested)
     * promotes the new version to current.
     */
    public QuestionnaireVersionSummaryDto commitDraft(String versionId, CommitVersionRequest req) {
        PublishedQuestionnaire v = versions.findById(versionId)
                .orElseThrow(() -> new ResourceNotFoundException("Version", "id", versionId));
        if (!"DRAFT".equals(v.getVersionStatus())) {
            throw new BadRequestException("This version is already committed.");
        }
        if (req == null || !StringUtils.hasText(req.getBump())) {
            throw new BadRequestException("bump (MAJOR|MINOR) is required");
        }
        String bump = req.getBump().trim().toUpperCase();
        if (!"MAJOR".equals(bump) && !"MINOR".equals(bump)) {
            throw new BadRequestException("bump must be MAJOR or MINOR");
        }
        Questionnaire p = parents.findById(v.getParentId())
                .orElseThrow(() -> new ResourceNotFoundException("Questionnaire", "id", v.getParentId()));

        // Latest committed → derive next label.
        int nextMajor = 1, nextMinor = 0;
        List<PublishedQuestionnaire> latest = versions.findLatestCommittedByParent(p.getId());
        if (!latest.isEmpty()) {
            PublishedQuestionnaire top = latest.get(0);
            int lm = top.getVersionMajor() == null ? 1 : top.getVersionMajor();
            int ln = top.getVersionMinor() == null ? 0 : top.getVersionMinor();
            if ("MAJOR".equals(bump)) { nextMajor = lm + 1; nextMinor = 0; }
            else { nextMajor = lm; nextMinor = ln + 1; }
        }
        v.setVersionMajor(nextMajor);
        v.setVersionMinor(nextMinor);
        v.setVersionLabel("v" + nextMajor + "." + nextMinor);
        v.setVersionName(req.getVersionName() != null ? req.getVersionName().trim() : v.getVersionName());
        v.setVersionComments(req.getVersionComments());
        v.setVersionStatus("COMMITTED");
        v.setCommittedAt(OffsetDateTime.now(ZoneOffset.UTC));
        v.setCommittedBy(currentActorId());
        PublishedQuestionnaire saved = versions.save(v);

        // Sync the parent's cached display fields from this commit so
        // the Question Bank list updates without an explicit refresh.
        if (saved.getName() != null && !saved.getName().equals(p.getName())) p.setName(saved.getName());
        if (saved.getVertical() != null) p.setVertical(saved.getVertical());

        boolean promote = Boolean.TRUE.equals(req.getSetAsCurrent())
                || p.getCurrentVersionId() == null;
        if (promote) p.setCurrentVersionId(saved.getId());
        parents.save(p);

        audit.record("VERSION_COMMITTED", "questionnaire_version", saved.getId(),
                null, snapshotVersion(saved));
        if (promote) {
            audit.record("VERSION_SET_CURRENT", "questionnaire", p.getId(),
                    null, java.util.Collections.singletonMap("currentVersionId", saved.getId()));
        }
        return toVersionSummary(saved, p.getCurrentVersionId());
    }

    /**
     * Discard a draft. COMMITTED versions are never deletable.
     */
    public void discardDraft(String versionId) {
        PublishedQuestionnaire v = versions.findById(versionId).orElse(null);
        if (v == null) return;
        if (!"DRAFT".equals(v.getVersionStatus())) {
            throw new BadRequestException("Cannot discard a COMMITTED version. History is preserved forever.");
        }
        Map<String, Object> snap = snapshotVersion(v);
        versions.delete(v);
        audit.record("DRAFT_DISCARDED", "questionnaire_version", versionId, snap, null);
    }

    // ---------------- Helpers ----------------

    /** Build a blank draft row under a parent. */
    private PublishedQuestionnaire newDraft(String parentId, PublishedQuestionnaire base) {
        PublishedQuestionnaire d = new PublishedQuestionnaire();
        d.setId("V-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        d.setParentId(parentId);
        d.setName(base != null ? base.getName() : "");
        d.setVertical(base != null ? base.getVertical() : null);
        d.setVersionStatus("DRAFT");
        d.setVersionMajor(0);
        d.setVersionMinor(0);
        d.setVersionLabel("draft");
        return d;
    }

    /**
     * Clone an existing COMMITTED row as a brand-new DRAFT. We persist
     * the new row first (so it has a stable id) and then re-run the
     * existing QuestionnairesService.upsert pipeline using the source's
     * JSON to materialise the MQ tree / questions / options on the
     * draft. That keeps all the conversion logic in one place.
     */
    private PublishedQuestionnaire cloneAsDraft(PublishedQuestionnaire base) {
        PublishedQuestionnaire draft = newDraft(base.getParentId(), base);
        draft.setBranchedFromVersionId(base.getId());
        // Copy scalar metadata from base; content (MQs/questions) is
        // synced below via the JSON DTO so it carries through the same
        // child-row build that an admin save would.
        draft.setShortName(base.getShortName());
        draft.setCategory(base.getCategory());
        draft.setDescription(base.getDescription());
        draft.setDuration(base.getDuration());
        draft.setTier(base.getTier());
        draft.setLanguages(base.getLanguages() == null ? new HashSet<>() : new HashSet<>(base.getLanguages()));
        draft.setDemo(base.isDemo());
        draft.setDisclaimer(base.getDisclaimer());
        draft.setInstructions(base.getInstructions());
        draft.setShowInstructions(base.isShowInstructions());
        draft.setDemographicFieldKeys(base.getDemographicFieldKeys() == null
                ? new HashSet<>() : new HashSet<>(base.getDemographicFieldKeys()));
        PublishedQuestionnaire savedShell = versions.save(draft);

        // Round-trip the source's content through the existing DTO
        // pipeline so the draft ends up with its own copies of MQs,
        // questions, options, and scores. Avoids JPA's "you can't
        // re-attach a detached managed entity" issues.
        QuestionnaireDto baseDto = content.get(base.getId());
        baseDto.setId(savedShell.getId());
        content.upsert(baseDto);
        // Re-fetch to surface the persisted version.
        return versions.findById(savedShell.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Version", "id", savedShell.getId()));
    }

    private QuestionnaireParentDto toParentDto(Questionnaire p, boolean withVersions) {
        QuestionnaireParentDto d = new QuestionnaireParentDto();
        d.setId(p.getId());
        d.setName(p.getName());
        d.setVertical(p.getVertical());
        d.setCurrentVersionId(p.getCurrentVersionId());
        if (p.getCreatedAt() != null) {
            d.setCreatedAt(p.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        }
        d.setCreatedBy(p.getCreatedBy());
        d.setVersionCount((int) versions.countCommittedByParent(p.getId()));
        d.setDraftCount((int) versions.countDraftsByParent(p.getId()));
        if (p.getCurrentVersionId() != null) {
            versions.findById(p.getCurrentVersionId())
                    .ifPresent(cv -> d.setCurrentVersionLabel(cv.getVersionLabel()));
        }
        if (withVersions) {
            List<QuestionnaireVersionSummaryDto> list = versions.findByParent(p.getId()).stream()
                    .map(v -> toVersionSummary(v, p.getCurrentVersionId()))
                    .collect(Collectors.toList());
            // DRAFTs sort to the top, then COMMITTED versions newest
            // first (semver descending). Nulls fold to 0.
            list.sort((a, b) -> {
                int draftA = "DRAFT".equals(a.getStatus()) ? 0 : 1;
                int draftB = "DRAFT".equals(b.getStatus()) ? 0 : 1;
                if (draftA != draftB) return Integer.compare(draftA, draftB);
                int majA = a.getVersionMajor() == null ? 0 : a.getVersionMajor();
                int majB = b.getVersionMajor() == null ? 0 : b.getVersionMajor();
                if (majA != majB) return Integer.compare(majB, majA);
                int minA = a.getVersionMinor() == null ? 0 : a.getVersionMinor();
                int minB = b.getVersionMinor() == null ? 0 : b.getVersionMinor();
                return Integer.compare(minB, minA);
            });
            d.setVersions(list);
        }
        return d;
    }

    private QuestionnaireVersionSummaryDto toVersionSummary(PublishedQuestionnaire v, String currentVersionId) {
        QuestionnaireVersionSummaryDto d = new QuestionnaireVersionSummaryDto();
        d.setId(v.getId());
        d.setParentId(v.getParentId());
        d.setVersionMajor(v.getVersionMajor());
        d.setVersionMinor(v.getVersionMinor());
        d.setVersionLabel(v.getVersionLabel());
        d.setVersionName(v.getVersionName());
        d.setVersionComments(v.getVersionComments());
        d.setStatus(v.getVersionStatus());
        d.setBranchedFromVersionId(v.getBranchedFromVersionId());
        if (v.getCommittedAt() != null) {
            d.setCommittedAt(v.getCommittedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        }
        d.setCommittedBy(v.getCommittedBy());
        d.setIsCurrent(Objects.equals(v.getId(), currentVersionId));
        d.setInUseByAssessmentCount((int) assessments.countByQuestionnaireVersionId(v.getId()));
        return d;
    }

    private Map<String, Object> snapshotParent(Questionnaire p) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", p.getId());
        m.put("name", p.getName());
        m.put("vertical", p.getVertical());
        m.put("currentVersionId", p.getCurrentVersionId());
        return m;
    }

    private Map<String, Object> snapshotVersion(PublishedQuestionnaire v) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", v.getId());
        m.put("parentId", v.getParentId());
        m.put("versionLabel", v.getVersionLabel());
        m.put("status", v.getVersionStatus());
        m.put("name", v.getName());
        return m;
    }

    private String currentActorId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof UserPrincipal)) return null;
        return ((UserPrincipal) auth.getPrincipal()).getId();
    }
}
