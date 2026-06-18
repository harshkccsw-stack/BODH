package com.bodhpsychometric.bodhassess.config;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * One-shot, idempotent backfill that stamps {@code created_at} on legacy
 * assessment rows that have none.
 *
 * The {@code assessments} table is created by Hibernate (ddl-auto=update), so
 * unlike the hand-written tables in 01-schema.sql its {@code created_at} column
 * never got a {@code DEFAULT CURRENT_TIMESTAMP}. Rows inserted before
 * {@link com.bodhpsychometric.bodhassess.model.Assessment} switched to
 * {@code @CreationTimestamp} therefore carry NULL, which makes the admin
 * "Newest first" sort a no-op for that data.
 *
 * We approximate each assessment's creation time with the earliest session
 * provisioned under it ({@code portal_sessions.created_at}, which DOES have a
 * reliable DB default). Assessments with no sessions stay NULL. Only NULL rows
 * are touched, so re-running is safe.
 */
@Component
@Order(30)
public class AssessmentCreatedAtBackfillRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AssessmentCreatedAtBackfillRunner.class);

    @PersistenceContext
    private EntityManager em;

    @Override
    @Transactional
    public void run(String... args) {
        int updated = em.createNativeQuery(
                "UPDATE assessments a "
              + "JOIN (SELECT assessment_id, MIN(created_at) AS first_created "
              + "      FROM portal_sessions "
              + "      WHERE assessment_id IS NOT NULL "
              + "      GROUP BY assessment_id) s ON s.assessment_id = a.id "
              + "SET a.created_at = s.first_created "
              + "WHERE a.created_at IS NULL")
            .executeUpdate();
        if (updated > 0) {
            log.info("AssessmentCreatedAtBackfill: stamped created_at on {} assessment(s).", updated);
        }
    }
}
