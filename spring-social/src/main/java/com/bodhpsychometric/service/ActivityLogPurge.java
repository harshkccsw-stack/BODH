package com.bodhpsychometric.service;

import java.time.OffsetDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.repository.activity.ActivityLogRepository;

/**
 * Retention for the activity trail.
 *
 * Not optional. Every request is recorded, reads included, so this table is
 * the fastest-growing thing in the database and nothing else ever deletes
 * from it. Without this job it grows until the disk decides the policy.
 *
 * 365 days is a DEFAULT, not a decision — the number is a policy question for
 * whoever owns compliance, and it is a property so answering it later is a
 * config change. Setting it to 0 or less switches the purge off entirely, for
 * a deployment that ships rows elsewhere and wants to keep everything.
 *
 * Deletes in bounded batches, with a cap per run: one unbounded DELETE over a
 * table this size holds row locks for as long as it runs, against the same
 * database that is serving traffic. Whatever is left over is simply picked up
 * by the next run.
 */
@Service
public class ActivityLogPurge {

    private static final Logger log = LoggerFactory.getLogger(ActivityLogPurge.class);

    private static final int BATCH_SIZE = 1000;
    private static final int MAX_BATCHES_PER_RUN = 50;

    private final ActivityLogRepository activityLogs;
    private final int retentionDays;

    public ActivityLogPurge(ActivityLogRepository activityLogs,
            @Value("${app.activity.retention-days:365}") int retentionDays) {
        this.activityLogs = activityLogs;
        this.retentionDays = retentionDays;
    }

    /** 03:15 daily — off-peak, and not on the hour where every other job lives. */
    @Scheduled(cron = "${app.activity.purge-cron:0 15 3 * * *}")
    @Transactional
    public void purge() {
        if (retentionDays <= 0) {
            return;
        }
        OffsetDateTime cutoff = OffsetDateTime.now().minusDays(retentionDays);
        int total = 0;
        for (int i = 0; i < MAX_BATCHES_PER_RUN; i++) {
            int deleted = activityLogs.deleteOlderThan(cutoff, BATCH_SIZE);
            total += deleted;
            if (deleted < BATCH_SIZE) {
                break;
            }
        }
        if (total > 0) {
            log.info("Activity retention: deleted {} row(s) older than {}", total, cutoff);
        }
    }
}
