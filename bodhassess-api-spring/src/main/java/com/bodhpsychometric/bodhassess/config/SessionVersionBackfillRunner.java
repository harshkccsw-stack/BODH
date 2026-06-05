package com.bodhpsychometric.bodhassess.config;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.model.Assessment;
import com.bodhpsychometric.bodhassess.model.PortalSession;
import com.bodhpsychometric.bodhassess.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;

/**
 * One-shot, idempotent backfill that stamps existing portal_sessions with
 * the questionnaire version they should resolve content by.
 *
 * Sessions created before the version-pinning column existed only carried
 * the questionnaire NAME (via {@code instrument}); the take page resolved
 * content by name, which let a later re-publish leak into already-live
 * sessions. We copy {@code questionnaire_version_id} from each session's
 * parent assessment so the take page can pin content to the exact version.
 *
 * Runs @Order(20) — after {@link QuestionnaireVersioningMigrationRunner}
 * (@Order(10)) which is what gives assessments their questionnaire_version_id
 * in the first place. Sessions whose assessment still has no version id are
 * left null and fall back to the by-name lookup.
 */
@Component
@Order(20)
public class SessionVersionBackfillRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SessionVersionBackfillRunner.class);

    @Autowired private PortalSessionRepository sessions;
    @Autowired private AssessmentRepository assessments;

    @Override
    @Transactional
    public void run(String... args) {
        List<PortalSession> pending = sessions.findMissingVersionId();
        long stamped = 0;
        for (PortalSession s : pending) {
            Assessment a = assessments.findById(s.getAssessmentId()).orElse(null);
            if (a == null || a.getQuestionnaireVersionId() == null) continue;
            s.setQuestionnaireVersionId(a.getQuestionnaireVersionId());
            sessions.save(s);
            stamped++;
        }
        if (stamped > 0) {
            log.info("SessionVersionBackfill: pinned questionnaire_version_id on {} session(s).", stamped);
        }
    }
}
