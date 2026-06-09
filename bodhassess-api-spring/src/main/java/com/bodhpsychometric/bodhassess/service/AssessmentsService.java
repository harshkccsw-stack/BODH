package com.bodhpsychometric.bodhassess.service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.AssessmentAnswer;
import com.bodhpsychometric.bodhassess.model.PortalSession;
import com.bodhpsychometric.bodhassess.model.PortalSessionDemographic;
import com.bodhpsychometric.bodhassess.model.PortalSessionMqtScore;
import com.bodhpsychometric.bodhassess.payload.AssessmentSessionDto;
import com.bodhpsychometric.bodhassess.payload.AssessmentGroupDto;
import com.bodhpsychometric.bodhassess.payload.AssessmentSummaryDto;
import com.bodhpsychometric.bodhassess.payload.HeartbeatRequest;
import com.bodhpsychometric.bodhassess.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;


@Service
@Transactional
public class AssessmentsService {

    private static final Logger log = LoggerFactory.getLogger(AssessmentsService.class);

    @Autowired
    private PortalSessionRepository repo;

    @Autowired
    private AssessmentRepository assessmentRepo;

    @Autowired
    private HeartbeatService heartbeats;

    @Transactional(readOnly = true)
    public List<AssessmentSessionDto> list(String respondentId) {
        List<PortalSession> rows = StringUtils.hasText(respondentId)
                ? repo.findByRespondentId(respondentId)
                : repo.findAllOrderByCreated();
        if (StringUtils.hasText(respondentId)) {
            // When the parent assessment was deleted, hide the respondent's
            // pending/not-started cards for it — but keep submitted
            // (Completed) sessions so the record and its answers remain on the
            // dashboard. Legacy sessions with a null assessmentId predate the
            // column and are always kept.
            rows = dropOrphanedPendingSessions(rows);
            // One card per assessment: a respondent reachable through more than
            // one allotment (entity, group, individual) should still see a
            // single card for that assessment. Provisioning already guards
            // against this, but collapse here too so the portal is correct even
            // if duplicate sessions ever slip in.
            rows = dedupByAssessment(rows);
        }
        return rows.stream().map(this::toDto).collect(Collectors.toList());
    }

    /**
     * Collapse multiple sessions that share an assessmentId into one, keeping
     * the most-progressed (so the respondent never loses answers): a submitted
     * session beats a started one, which beats an untouched one; ties go to the
     * earliest-created (original) session. Sessions with a null assessmentId
     * (legacy) are each kept as-is.
     */
    private List<PortalSession> dedupByAssessment(List<PortalSession> rows) {
        Map<String, PortalSession> best = new LinkedHashMap<>();
        List<PortalSession> out = new ArrayList<>();
        for (PortalSession s : rows) {
            String aid = s.getAssessmentId();
            if (!StringUtils.hasText(aid)) { out.add(s); continue; }
            PortalSession cur = best.get(aid);
            if (cur == null || progressRank(s) > progressRank(cur)
                    || (progressRank(s) == progressRank(cur) && createdBefore(s, cur))) {
                best.put(aid, s);
            }
        }
        out.addAll(best.values());
        return out;
    }

    private int progressRank(PortalSession s) {
        if ("Completed".equalsIgnoreCase(s.getStatus())) return 2;
        if (s.getStartedAt() != null) return 1;
        return 0;
    }

    private boolean createdBefore(PortalSession a, PortalSession b) {
        if (a.getCreatedAt() == null) return false;
        if (b.getCreatedAt() == null) return true;
        return a.getCreatedAt().isBefore(b.getCreatedAt());
    }

    private List<PortalSession> dropOrphanedPendingSessions(List<PortalSession> rows) {
        Set<String> assessmentIds = rows.stream()
                .filter(s -> !"Completed".equalsIgnoreCase(s.getStatus()))
                .map(PortalSession::getAssessmentId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (assessmentIds.isEmpty()) return rows;
        Set<String> existing = new HashSet<>(assessmentRepo.findExistingIds(assessmentIds));
        return rows.stream()
                .filter(s -> "Completed".equalsIgnoreCase(s.getStatus())
                        || !StringUtils.hasText(s.getAssessmentId())
                        || existing.contains(s.getAssessmentId()))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<AssessmentSummaryDto> listSummaries(String respondentId, Integer limit) {
        List<AssessmentSummaryDto> rows = StringUtils.hasText(respondentId)
                ? repo.findSummariesByRespondentId(respondentId)
                : repo.findAllSummariesOrderByCreated();
        if (limit != null && limit > 0 && rows.size() > limit) {
            return new ArrayList<>(rows.subList(0, limit));
        }
        return rows;
    }

    @Transactional(readOnly = true)
    public List<AssessmentSummaryDto> listSummariesByAssessment(String assessmentId) {
        if (!StringUtils.hasText(assessmentId)) {
            throw new BadRequestException("assessmentId query param required");
        }
        return repo.findSummariesByAssessmentId(assessmentId);
    }

    @Transactional(readOnly = true)
    public List<AssessmentGroupDto> listGroups() {
        return repo.findAssessmentGroups();
    }

    @Transactional(readOnly = true)
    public AssessmentSessionDto get(String id) {
        return toDto(repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Assessment", "id", id)));
    }

    public AssessmentSessionDto create(AssessmentSessionDto dto) {
        if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getRespondentId())
                || !StringUtils.hasText(dto.getInstrument())) {
            throw new BadRequestException("id, respondentId, instrument required");
        }
        if (repo.existsById(dto.getId())) {
            return toDto(repo.findById(dto.getId()).get());
        }
        PortalSession s = fromDto(dto);
        return toDto(repo.save(s));
    }

    public AssessmentSessionDto.BulkAssessmentResponse bulkCreate(List<AssessmentSessionDto> items) {
        int created = 0;
        List<AssessmentSessionDto.BulkAssessmentError> errors = new ArrayList<>();
        if (items == null) return new AssessmentSessionDto.BulkAssessmentResponse(0, errors);
        for (int i = 0; i < items.size(); i++) {
            AssessmentSessionDto dto = items.get(i);
            if (dto == null) {
                errors.add(new AssessmentSessionDto.BulkAssessmentError(i, null, "row is null"));
                continue;
            }
            if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getRespondentId())
                    || !StringUtils.hasText(dto.getInstrument())) {
                errors.add(new AssessmentSessionDto.BulkAssessmentError(i, dto.getId(),
                        "id, respondentId, instrument required"));
                continue;
            }
            if (repo.existsById(dto.getId())) {
                errors.add(new AssessmentSessionDto.BulkAssessmentError(i, dto.getId(),
                        "session already exists"));
                continue;
            }
            try {
                repo.save(fromDto(dto));
                created++;
            } catch (Exception e) {
                log.warn("bulkCreate row {} (id={}) failed: {}", i, dto.getId(), e.getMessage());
                errors.add(new AssessmentSessionDto.BulkAssessmentError(i, dto.getId(),
                        e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
            }
        }
        return new AssessmentSessionDto.BulkAssessmentResponse(created, errors);
    }

    public AssessmentSessionDto update(String id, AssessmentSessionDto dto) {
        PortalSession s = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Assessment", "id", id));
        if (StringUtils.hasText(dto.getName())) s.setName(dto.getName());
        if (StringUtils.hasText(dto.getLanguage())) s.setLanguage(dto.getLanguage());
        if (StringUtils.hasText(dto.getStatus())) s.setStatus(dto.getStatus());
        s.setScore(dto.getScore());
        if (dto.getAnswers() != null) {
            // Stamp started_at on the first save that carries at least one
            // non-empty answer. Drives the 24h/48h overdue notifications and
            // the time-to-start metric on the respondents dashboard.
            if (s.getStartedAt() == null && hasAnyAnswer(dto.getAnswers())) {
                s.setStartedAt(OffsetDateTime.now(ZoneOffset.UTC));
            }
            applyAnswersFromMap(s, dto.getAnswers());
        }
        if (dto.getMqtScores() != null) applyMqtScoresFromMap(s, dto.getMqtScores());
        if (dto.getDemographics() != null) applyDemographicsFromMap(s, dto.getDemographics());

        if ("Completed".equalsIgnoreCase(dto.getStatus())) {
            OffsetDateTime ts = null;
            if (StringUtils.hasText(dto.getCompletedAt())) {
                try {
                    ts = OffsetDateTime.parse(dto.getCompletedAt());
                } catch (Exception e) {
                    log.warn("update session {} got malformed completedAt '{}': {}", id, dto.getCompletedAt(), e.getMessage());
                }
            }
            if (ts == null) ts = OffsetDateTime.now(ZoneOffset.UTC);
            s.setCompletedAt(ts);
            heartbeats.clear(id);
        }
        return toDto(repo.save(s));
    }

    public void recordHeartbeat(String id, HeartbeatRequest body, UserPrincipal principal) {
        PortalSession s = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Assessment", "id", id));
        // Heartbeat tracks "where is the respondent in this assessment" for
        // the Live Tracking admin view — purely informational. The rest of
        // the take flow (PUT /assessments/{id} submit, GET /{id}, /reset)
        // has no auth at all, so a strict principal == respondent check here
        // produced spurious 403s whenever a take URL was opened by anyone
        // other than the original respondent (kiosk, shared link, etc.).
        // Just record what we can; if there's no auth, attribute the beat
        // to the session's own respondent so the tracking still works.
        if (principal != null && !s.getRespondentId().equals(principal.getId())) {
            log.debug("heartbeat for session {} from principal {} (owner {}): allowing",
                    id, principal.getId(), s.getRespondentId());
        }
        if ("Completed".equalsIgnoreCase(s.getStatus())) return;
        heartbeats.record(id, s.getRespondentId(), s.getInstrument(), s.getGroupId(),
                body.getCurrentIndex(), body.getTotalQuestions());
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    /**
     * Reset a respondent's session so they must take the assessment again.
     * Wipes the previous attempt — answers, per-MQT scores, demographics,
     * overall score — and returns the session to a fresh, not-started state
     * (Active, no started/completed timestamps, heartbeat cleared). The
     * session itself (and its allotment) is kept so the assessment stays in
     * the respondent's portal.
     */
    public AssessmentSessionDto reset(String id) {
        PortalSession s = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Assessment", "id", id));
        // orphanRemoval on the child collections deletes the rows on flush.
        s.getAnswers().clear();
        s.getMqtScores().clear();
        s.getDemographics().clear();
        s.setScore(null);
        s.setStatus("Active");
        s.setStartedAt(null);
        s.setCompletedAt(null);
        heartbeats.clear(id);
        return toDto(repo.save(s));
    }

    private PortalSession fromDto(AssessmentSessionDto dto) {
        PortalSession s = new PortalSession();
        s.setId(dto.getId());
        s.setAssessmentId(dto.getAssessmentId());
        s.setName(dto.getName());
        s.setRespondentId(dto.getRespondentId());
        s.setRespondentName(dto.getRespondentName());
        s.setRespondentEmail(dto.getRespondentEmail());
        s.setInstrument(dto.getInstrument());
        s.setInstrumentFullName(dto.getInstrumentFullName());
        s.setVertical(dto.getVertical());
        s.setLanguage(StringUtils.hasText(dto.getLanguage()) ? dto.getLanguage() : "English");
        s.setStatus(StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : "Active");
        s.setScore(dto.getScore());
        applyAnswersFromMap(s, dto.getAnswers());
        applyMqtScoresFromMap(s, dto.getMqtScores());
        applyDemographicsFromMap(s, dto.getDemographics());
        s.setGroupId(dto.getGroupId());
        s.setGroupName(dto.getGroupName());
        s.setEntityId(dto.getEntityId());
        s.setEntityName(dto.getEntityName());
        s.setConsentId(dto.getConsentId());
        s.setProctoring(dto.isProctoring());
        s.setInvitationSent(dto.isInvitationSent());
        s.setShowQuestionIndex(dto.isShowQuestionIndex());
        return s;
    }

    private AssessmentSessionDto toDto(PortalSession s) {
        AssessmentSessionDto d = new AssessmentSessionDto();
        d.setId(s.getId());
        d.setAssessmentId(s.getAssessmentId());
        d.setName(s.getName());
        d.setRespondentId(s.getRespondentId());
        d.setRespondentName(s.getRespondentName());
        d.setRespondentEmail(s.getRespondentEmail());
        d.setInstrument(s.getInstrument());
        d.setInstrumentFullName(s.getInstrumentFullName());
        d.setQuestionnaireVersionId(s.getQuestionnaireVersionId());
        d.setVertical(s.getVertical());
        d.setLanguage(s.getLanguage());
        d.setStatus(s.getStatus());
        d.setScore(s.getScore());
        d.setAnswers(answersAsMap(s));
        d.setMqtScores(mqtScoresAsMap(s));
        d.setDemographics(demographicsAsMap(s));
        d.setGroupId(s.getGroupId());
        d.setGroupName(s.getGroupName());
        d.setEntityId(s.getEntityId());
        d.setEntityName(s.getEntityName());
        d.setConsentId(s.getConsentId());
        d.setProctoring(s.isProctoring());
        d.setInvitationSent(s.isInvitationSent());
        d.setShowQuestionIndex(s.isShowQuestionIndex());
        if (s.getCreatedAt() != null) d.setCreatedAt(s.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        if (s.getCompletedAt() != null) d.setCompletedAt(s.getCompletedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        if (s.getStartedAt() != null) d.setStartedAt(s.getStartedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        return d;
    }

    /**
     * Rebuild the session's answer rows from the incoming map. orphanRemoval
     * on the @OneToMany takes care of deleting any rows for questions that
     * the new map no longer mentions.
     */
    private void applyAnswersFromMap(PortalSession s, Map<String, Object> in) {
        if (in == null) return;
        // Reconcile in place rather than clear-and-recreate: an unchanged
        // question becomes an UPDATE, not a DELETE+INSERT of the same
        // (session_id, question_id). Recreating made Hibernate flush the
        // INSERT before the orphan DELETE, tripping the
        // uniq_answer_session_question constraint on every re-save (e.g. the
        // submit PUT, which re-sends all previously autosaved answers).
        Map<String, AssessmentAnswer> existing = new HashMap<>();
        for (AssessmentAnswer a : s.getAnswers()) existing.put(a.getQuestionId(), a);
        Set<String> incoming = new HashSet<>();
        for (Map.Entry<String, Object> e : in.entrySet()) {
            String qid = e.getKey();
            if (qid == null || qid.isEmpty()) continue;
            incoming.add(qid);
            AssessmentAnswer row = existing.get(qid);
            if (row == null) {
                row = new AssessmentAnswer();
                row.setSession(s);
                row.setQuestionId(qid);
                s.getAnswers().add(row);
            }
            Object v = e.getValue();
            if (v instanceof Number) {
                row.setOptionIndex(((Number) v).intValue());
                row.setFreeText(null);
            } else if (v != null) {
                row.setFreeText(v.toString());
                row.setOptionIndex(null);
            } else {
                row.setOptionIndex(null);
                row.setFreeText(null);
            }
        }
        s.getAnswers().removeIf(a -> !incoming.contains(a.getQuestionId()));
    }

    /** Flatten answer rows back to the API's {questionId: value} shape. */
    private Map<String, Object> answersAsMap(PortalSession s) {
        Map<String, Object> out = new HashMap<>();
        if (s.getAnswers() == null) return out;
        for (AssessmentAnswer a : s.getAnswers()) {
            if (a.getQuestionId() == null) continue;
            if (a.getOptionIndex() != null) {
                out.put(a.getQuestionId(), a.getOptionIndex());
            } else {
                out.put(a.getQuestionId(), a.getFreeText());
            }
        }
        return out;
    }

    /**
     * Rebuild the session's per-MQT score rows from the incoming map.
     * Accepts either the current shape (`{mqt_id: {name, score}}`) or the
     * legacy shape (`{mqt_id_or_name: score}`) so older payloads still load.
     */
    private void applyMqtScoresFromMap(PortalSession s, Map<String, Object> in) {
        if (in == null) return;
        // Reconcile in place — see applyAnswersFromMap for why clear-and-recreate
        // trips the uniq_session_mqt constraint on re-save.
        Map<String, PortalSessionMqtScore> existing = new HashMap<>();
        for (PortalSessionMqtScore r : s.getMqtScores()) existing.put(r.getMqtId(), r);
        Set<String> incoming = new HashSet<>();
        for (Map.Entry<String, Object> e : in.entrySet()) {
            String key = e.getKey();
            if (key == null || key.isEmpty()) continue;
            Object v = e.getValue();
            Double score = null;
            String name = null;
            if (v instanceof Number) {
                score = ((Number) v).doubleValue();
            } else if (v instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> obj = (Map<String, Object>) v;
                Object rawScore = obj.get("score");
                Object rawName = obj.get("name");
                if (rawScore instanceof Number) score = ((Number) rawScore).doubleValue();
                if (rawName != null) name = rawName.toString();
            }
            if (score == null) continue;
            incoming.add(key);
            PortalSessionMqtScore row = existing.get(key);
            if (row == null) {
                row = new PortalSessionMqtScore();
                row.setSession(s);
                row.setMqtId(key);
                s.getMqtScores().add(row);
            }
            row.setMqtName(name);
            row.setScore(score);
        }
        s.getMqtScores().removeIf(r -> !incoming.contains(r.getMqtId()));
    }

    /** Flatten MQT score rows back to the current API shape. */
    private Map<String, Object> mqtScoresAsMap(PortalSession s) {
        Map<String, Object> out = new HashMap<>();
        if (s.getMqtScores() == null) return out;
        for (PortalSessionMqtScore row : s.getMqtScores()) {
            if (row.getMqtId() == null) continue;
            Map<String, Object> entry = new HashMap<>();
            entry.put("name", row.getMqtName());
            entry.put("score", row.getScore());
            out.put(row.getMqtId(), entry);
        }
        return out;
    }

    /** Rebuild demographic answer rows from the incoming map. */
    private void applyDemographicsFromMap(PortalSession s, Map<String, Object> in) {
        if (in == null) return;
        // Reconcile in place — see applyAnswersFromMap for why clear-and-recreate
        // trips the uniq_session_field constraint on re-save.
        Map<String, PortalSessionDemographic> existing = new HashMap<>();
        for (PortalSessionDemographic r : s.getDemographics()) existing.put(r.getFieldKey(), r);
        Set<String> incoming = new HashSet<>();
        for (Map.Entry<String, Object> e : in.entrySet()) {
            String key = e.getKey();
            if (key == null || key.isEmpty()) continue;
            Object v = e.getValue();
            if (v == null) continue;
            incoming.add(key);
            PortalSessionDemographic row = existing.get(key);
            if (row == null) {
                row = new PortalSessionDemographic();
                row.setSession(s);
                row.setFieldKey(key);
                s.getDemographics().add(row);
            }
            row.setValue(v.toString());
        }
        s.getDemographics().removeIf(r -> !incoming.contains(r.getFieldKey()));
    }

    /** Flatten demographic rows back to {field_key: value}. */
    private Map<String, Object> demographicsAsMap(PortalSession s) {
        Map<String, Object> out = new HashMap<>();
        if (s.getDemographics() == null) return out;
        for (PortalSessionDemographic row : s.getDemographics()) {
            if (row.getFieldKey() == null) continue;
            out.put(row.getFieldKey(), row.getValue());
        }
        return out;
    }

    private boolean hasAnyAnswer(Map<String, Object> answers) {
        if (answers == null || answers.isEmpty()) return false;
        for (Object v : answers.values()) {
            if (v == null) continue;
            if (v instanceof String) {
                if (!((String) v).trim().isEmpty()) return true;
            } else {
                return true;
            }
        }
        return false;
    }
}
