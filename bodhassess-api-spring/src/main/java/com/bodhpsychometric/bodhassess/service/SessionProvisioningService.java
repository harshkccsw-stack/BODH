package com.bodhpsychometric.bodhassess.service;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.model.Assessment;
import com.bodhpsychometric.bodhassess.model.AssessmentEntityAllotment;
import com.bodhpsychometric.bodhassess.model.AssessmentEntityAllotmentId;
import com.bodhpsychometric.bodhassess.model.EntityRegistration;
import com.bodhpsychometric.bodhassess.model.PortalSession;
import com.bodhpsychometric.bodhassess.model.Respondent;
import com.bodhpsychometric.bodhassess.model.RespondentGroup;
import com.bodhpsychometric.bodhassess.repository.AssessmentEntityAllotmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.repository.EntityRegistrationRepository;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;
import com.bodhpsychometric.bodhassess.repository.RespondentGroupRepository;
import com.bodhpsychometric.bodhassess.repository.RespondentRepository;

/**
 * Materialises portal_sessions from assessment allotments.
 *
 * An {@link Assessment} (assessment-records) plus its allotment rows only
 * record WHO an assessment is assigned to. The respondent portal, however,
 * lists {@link PortalSession} rows ({@code GET /assessments?respondentId=...}),
 * and the take page resolves questions by questionnaire NAME via
 * {@code /questionnaires/by-name}. So an allotment alone is invisible to the
 * respondent — a session has to exist. This service bridges the two for all
 * three allotment kinds:
 *
 *   - individual  → one session for that respondent
 *   - group       → one session per group member (groups carry no cap)
 *   - entity      → one session per entity member, up to the per-(entity,
 *                   assessment) cap
 *
 * Idempotent per (assessment, respondent): a respondent who is reachable
 * through more than one allotment (e.g. individually AND via a group) still
 * gets exactly one session.
 */
@Service
public class SessionProvisioningService {

    private static final Logger log = LoggerFactory.getLogger(SessionProvisioningService.class);

    @Autowired private AssessmentRepository assessments;
    @Autowired private RespondentRepository respondents;
    @Autowired private PortalSessionRepository sessions;
    @Autowired private RespondentGroupRepository groups;
    @Autowired private EntityRegistrationRepository entities;
    @Autowired private AssessmentEntityAllotmentRepository entityAllotments;

    // ---------- Individuals ----------

    /** Look the assessment up by id, then provision. No-op if unknown.
     *  Returns true iff a session was created. */
    @Transactional
    public boolean provisionRespondent(String assessmentId, String respondentId) {
        Assessment a = loadAssessment(assessmentId, respondentId);
        return a != null && provision(a, respondentId, null, null, null, null);
    }

    /** Create the respondent's portal_session for this assessment if absent.
     *  Returns true iff a session was created. */
    @Transactional
    public boolean provisionRespondent(Assessment a, String respondentId) {
        return provision(a, respondentId, null, null, null, null);
    }

    // ---------- Groups ----------

    /** One session per member of the group. Groups carry no cap. */
    @Transactional
    public int provisionGroup(String assessmentId, String groupId) {
        Assessment a = assessments.findById(assessmentId).orElse(null);
        if (a == null) { log.warn("[session-provision] unknown assessment {} for group {}", assessmentId, groupId); return 0; }
        RespondentGroup g = groups.findById(groupId).orElse(null);
        if (g == null || g.getMemberIds() == null) return 0;
        int created = 0;
        for (String rid : g.getMemberIds()) {
            if (provision(a, rid, groupId, g.getName(), null, null)) created++;
        }
        return created;
    }

    // ---------- Entities ----------

    /**
     * One session per entity member, but never more than the per-(entity,
     * assessment) cap allows. A null cap means unlimited.
     */
    @Transactional
    public int provisionEntity(String assessmentId, String entityId) {
        Assessment a = assessments.findById(assessmentId).orElse(null);
        if (a == null) { log.warn("[session-provision] unknown assessment {} for entity {}", assessmentId, entityId); return 0; }
        EntityRegistration ent = entities.findById(entityId).orElse(null);
        if (ent == null || ent.getMemberIds() == null) return 0;

        Integer cap = entityAllotments
                .findById(new AssessmentEntityAllotmentId(assessmentId, entityId))
                .map(AssessmentEntityAllotment::getCap)
                .orElse(null);
        long existing = sessions.countByAssessmentIdAndEntityId(assessmentId, entityId);
        String entityName = StringUtils.hasText(ent.getCompanyName()) ? ent.getCompanyName() : ent.getName();

        int created = 0;
        for (String rid : ent.getMemberIds()) {
            if (cap != null && existing + created >= cap) {
                log.info("[session-provision] entity {} cap {} reached for assessment {} — remaining members not given sessions",
                        entityId, cap, assessmentId);
                break;
            }
            if (provision(a, rid, null, null, entityId, entityName)) created++;
        }
        return created;
    }

    // ---------- Core ----------

    private Assessment loadAssessment(String assessmentId, String respondentId) {
        if (!StringUtils.hasText(assessmentId)) return null;
        Assessment a = assessments.findById(assessmentId).orElse(null);
        if (a == null) log.warn("[session-provision] unknown assessment {} — cannot provision {}", assessmentId, respondentId);
        return a;
    }

    /**
     * Create one portal_session if none yet exists for this (assessment,
     * respondent). The session's instrument carries the questionnaire NAME
     * because the portal's take page resolves content via
     * {@code /questionnaires/by-name}. Returns true iff a session was created.
     */
    private boolean provision(Assessment a, String respondentId,
                              String groupId, String groupName,
                              String entityId, String entityName) {
        if (a == null || !StringUtils.hasText(respondentId)) return false;
        boolean exists = sessions.findByRespondentId(respondentId).stream()
                .anyMatch(s -> a.getId().equals(s.getAssessmentId()));
        if (exists) return false;

        Respondent r = respondents.findById(respondentId).orElse(null);
        PortalSession s = new PortalSession();
        s.setId("SESS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        s.setAssessmentId(a.getId());
        s.setName(a.getName());
        s.setRespondentId(respondentId);
        if (r != null) {
            s.setRespondentName(r.getName());
            s.setRespondentEmail(r.getEmail());
        }
        s.setInstrument(a.getQuestionnaireName());
        s.setInstrumentFullName(a.getQuestionnaireName());
        // Pin the exact version so a later re-publish can't change what
        // this respondent sees. Falls back to by-name resolution if null.
        s.setQuestionnaireVersionId(a.getQuestionnaireVersionId());
        s.setVertical(a.getVertical());
        s.setLanguage(StringUtils.hasText(a.getLanguage()) ? a.getLanguage() : "English");
        s.setStatus("Active");
        if (StringUtils.hasText(groupId)) { s.setGroupId(groupId); s.setGroupName(groupName); }
        if (StringUtils.hasText(entityId)) { s.setEntityId(entityId); s.setEntityName(entityName); }
        sessions.save(s);
        return true;
    }
}
