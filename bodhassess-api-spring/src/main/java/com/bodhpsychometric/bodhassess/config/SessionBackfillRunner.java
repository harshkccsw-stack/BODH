package com.bodhpsychometric.bodhassess.config;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import com.bodhpsychometric.bodhassess.model.AssessmentEntityAllotment;
import com.bodhpsychometric.bodhassess.model.AssessmentGroupAllotment;
import com.bodhpsychometric.bodhassess.model.AssessmentRespondentAllotment;
import com.bodhpsychometric.bodhassess.repository.AssessmentEntityAllotmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentGroupAllotmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentRespondentAllotmentRepository;
import com.bodhpsychometric.bodhassess.service.SessionProvisioningService;

/**
 * One-shot, idempotent catch-up: for every existing assessment allotment
 * (individual, group, entity) that has no matching portal_session, create it.
 *
 * Why this exists: allotments and portal_sessions are two layers — an
 * allotment records WHO an assessment is assigned to, while the respondent
 * portal lists {@code portal_sessions}. Allotments made before session
 * auto-provisioning landed (see {@link SessionProvisioningService}) left
 * respondents with an allotment but no session, so the assessment was
 * invisible to them. This sweep materialises those missing sessions on boot.
 *
 * Safe to run on every startup: {@code SessionProvisioningService} is
 * idempotent per (assessment, respondent) and entity provisioning respects the
 * per-(entity, assessment) cap, so already-provisioned allotments are skipped
 * and nothing is duplicated.
 *
 * Ordered after the identity ({@code @Order(2)}) and questionnaire-versioning
 * ({@code @Order(10)}) migrations so assessments/respondents are in their final
 * shape (e.g. questionnaire_version_id populated) before sessions are minted.
 */
@Component
@Order(20)
public class SessionBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SessionBackfillRunner.class);

    @Autowired private AssessmentRespondentAllotmentRepository respondentAllotments;
    @Autowired private AssessmentGroupAllotmentRepository groupAllotments;
    @Autowired private AssessmentEntityAllotmentRepository entityAllotments;
    @Autowired private SessionProvisioningService provisioning;

    @Override
    public void run(ApplicationArguments args) {
        int fromIndividuals = 0;
        int fromGroups = 0;
        int fromEntities = 0;

        // Individuals: one session each, skipped if it already exists.
        List<AssessmentRespondentAllotment> individuals = respondentAllotments.findAll();
        for (AssessmentRespondentAllotment ra : individuals) {
            try {
                if (provisioning.provisionRespondent(ra.getAssessmentId(), ra.getRespondentId())) fromIndividuals++;
            } catch (Exception e) {
                log.warn("[session-backfill] individual {}:{} failed: {}",
                        ra.getAssessmentId(), ra.getRespondentId(), e.getMessage());
            }
        }

        // Groups: every member gets a session.
        List<AssessmentGroupAllotment> groups = groupAllotments.findAll();
        for (AssessmentGroupAllotment ga : groups) {
            try {
                fromGroups += provisioning.provisionGroup(ga.getAssessmentId(), ga.getGroupId());
            } catch (Exception e) {
                log.warn("[session-backfill] group {}:{} failed: {}",
                        ga.getAssessmentId(), ga.getGroupId(), e.getMessage());
            }
        }

        // Entities: members up to the per-(entity, assessment) cap.
        List<AssessmentEntityAllotment> entities = entityAllotments.findAll();
        for (AssessmentEntityAllotment ea : entities) {
            try {
                fromEntities += provisioning.provisionEntity(ea.getAssessmentId(), ea.getEntityId());
            } catch (Exception e) {
                log.warn("[session-backfill] entity {}:{} failed: {}",
                        ea.getAssessmentId(), ea.getEntityId(), e.getMessage());
            }
        }

        int total = fromIndividuals + fromGroups + fromEntities;
        if (total > 0) {
            log.info("[session-backfill] created {} missing portal_session(s) "
                            + "({} individual, {} group, {} entity).",
                    total, fromIndividuals, fromGroups, fromEntities);
        }
    }
}
