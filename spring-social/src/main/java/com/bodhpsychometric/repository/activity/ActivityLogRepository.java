package com.bodhpsychometric.repository.activity;

import java.time.OffsetDateTime;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.activity.ActivityLog;
import com.bodhpsychometric.model.activity.enums.ActivityOutcome;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, Long> {

    /**
     * The viewer's one query. Every filter is optional, and each is written as
     * "param is null or ..." so a single index-friendly statement serves all
     * combinations. Ordered newest-first in the query, so callers pass an
     * unsorted page.
     */
    @Query(value = "select a from ActivityLog a "
            + "where (:actorUserId is null or a.actorUserId = :actorUserId) "
            + "and (:outcome is null or a.outcome = :outcome) "
            + "and (:method is null or a.method = :method) "
            + "and (:from is null or a.occurredAt >= :from) "
            + "and (:to is null or a.occurredAt <= :to) "
            + "and (:search is null or lower(a.path) like :search "
            + "     or lower(a.actorEmail) like :search) "
            + "order by a.occurredAt desc, a.activityLogId desc",
            countQuery = "select count(a) from ActivityLog a "
            + "where (:actorUserId is null or a.actorUserId = :actorUserId) "
            + "and (:outcome is null or a.outcome = :outcome) "
            + "and (:method is null or a.method = :method) "
            + "and (:from is null or a.occurredAt >= :from) "
            + "and (:to is null or a.occurredAt <= :to) "
            + "and (:search is null or lower(a.path) like :search "
            + "     or lower(a.actorEmail) like :search)")
    Page<ActivityLog> findForViewer(Long actorUserId, ActivityOutcome outcome, String method,
            OffsetDateTime from, OffsetDateTime to, String search, Pageable pageable);

    /**
     * Retention. Deleted in bounded batches rather than one statement: an
     * unbounded DELETE over a table that logs every request holds row locks
     * for as long as it runs, and this one runs against the same database
     * serving traffic.
     */
    @Modifying
    @Query(value = "delete from activity_log where occurred_at < :cutoff limit :batchSize",
            nativeQuery = true)
    int deleteOlderThan(OffsetDateTime cutoff, int batchSize);
}
