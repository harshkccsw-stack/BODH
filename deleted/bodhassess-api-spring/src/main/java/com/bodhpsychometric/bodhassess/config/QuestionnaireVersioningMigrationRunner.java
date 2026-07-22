package com.bodhpsychometric.bodhassess.config;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.model.Assessment;
import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaire;
import com.bodhpsychometric.bodhassess.model.Questionnaire;
import com.bodhpsychometric.bodhassess.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.repository.PublishedQuestionnaireRepository;
import com.bodhpsychometric.bodhassess.repository.QuestionnaireRepository;

/**
 * One-shot migration that prepares the existing data for the
 * Git-style questionnaire versioning model.
 *
 * Two backfills, both idempotent (safe to re-run on boot):
 *
 *   1. Every PublishedQuestionnaire that's missing a parent_id gets one.
 *      A new Questionnaire row is created per legacy row and the legacy
 *      row is converted into its v1.0 with status=COMMITTED. The parent's
 *      current_version_id is pinned to that legacy row.
 *
 *   2. Every Assessment that's missing questionnaire_version_id gets it
 *      set from the row its questionnaire_id used to point at (which now
 *      represents a version). The questionnaire_id itself is then
 *      retargeted to the parent so the assessment carries both pointers.
 *
 * The runner is @Order(10) so it executes BEFORE
 * JsonToTableMigrationRunner (which is Order(0) or unannotated), in case
 * that one ever depends on the new shape.
 */
@Component
@Order(10)
public class QuestionnaireVersioningMigrationRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(QuestionnaireVersioningMigrationRunner.class);

    @Autowired private PublishedQuestionnaireRepository versions;
    @Autowired private QuestionnaireRepository parents;
    @Autowired private AssessmentRepository assessments;

    @Override
    @Transactional
    public void run(String... args) {
        long migratedVersions = backfillParents();
        long migratedAssessments = backfillAssessmentVersionIds();
        if (migratedVersions > 0 || migratedAssessments > 0) {
            log.info("Questionnaire versioning migration: {} legacy versions backfilled, {} assessments retargeted.",
                    migratedVersions, migratedAssessments);
        }
    }

    /**
     * For every PublishedQuestionnaire without a parent_id:
     *   - create a Questionnaire parent (name + vertical copied from the version)
     *   - set the version's parent_id, status=COMMITTED, version=1.0, label=v1.0
     *   - set committed_at = createdAt, committed_by = "system-migration"
     *   - set the parent's current_version_id to this version
     */
    private long backfillParents() {
        long count = 0;
        for (PublishedQuestionnaire v : versions.findAll()) {
            if (v.getParentId() != null && !v.getParentId().isEmpty()) continue;
            Questionnaire p = new Questionnaire();
            p.setId("Q-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
            p.setName(v.getName());
            p.setVertical(v.getVertical());
            p.setCurrentVersionId(v.getId());
            p.setCreatedBy("system-migration");
            parents.save(p);

            v.setParentId(p.getId());
            v.setVersionMajor(1);
            v.setVersionMinor(0);
            v.setVersionLabel("v1.0");
            v.setVersionStatus("COMMITTED");
            v.setVersionName("Initial version (migrated)");
            v.setVersionComments("Auto-imported from the pre-versioning schema.");
            v.setCommittedAt(v.getCreatedAt() != null ? v.getCreatedAt() : OffsetDateTime.now(ZoneOffset.UTC));
            v.setCommittedBy("system-migration");
            versions.save(v);
            count++;
        }
        return count;
    }

    /**
     * For every Assessment missing questionnaire_version_id:
     *   - the existing questionnaire_id used to point at a
     *     PublishedQuestionnaire (= what we now consider a version)
     *   - so questionnaire_version_id := old questionnaire_id, and
     *     questionnaire_id := that version's parent_id
     *
     * Built-up in memory in a single pass to avoid quadratic lookups on
     * large fleets.
     */
    private long backfillAssessmentVersionIds() {
        // versionId -> parentId, built from a single full sweep.
        Map<String, String> versionToParent = new HashMap<>();
        for (PublishedQuestionnaire v : versions.findAll()) {
            if (v.getParentId() != null) versionToParent.put(v.getId(), v.getParentId());
        }
        long count = 0;
        List<Assessment> rows = assessments.findAll();
        for (Assessment a : rows) {
            if (a.getQuestionnaireVersionId() != null && !a.getQuestionnaireVersionId().isEmpty()) continue;
            String oldRef = a.getQuestionnaireId();
            if (oldRef == null) continue;
            String parentId = versionToParent.get(oldRef);
            if (parentId == null) continue; // stale FK; leave the row alone
            a.setQuestionnaireVersionId(oldRef);
            a.setQuestionnaireId(parentId);
            assessments.save(a);
            count++;
        }
        return count;
    }
}
