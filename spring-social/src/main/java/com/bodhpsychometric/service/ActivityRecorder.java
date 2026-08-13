package com.bodhpsychometric.service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.bodhpsychometric.model.activity.ActivityLog;
import com.bodhpsychometric.repository.activity.ActivityLogRepository;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

/**
 * Writes the activity trail off the request thread.
 *
 * Three rules this class exists to enforce, all of them about the trail never
 * harming the thing it observes:
 *
 *   1. NEVER block the request. Rows go into a bounded queue and a single
 *      background thread drains them. Handing off is a queue offer.
 *
 *   2. NEVER fail the request. The queue is bounded and the overflow policy is
 *      DROP, counted and logged. The alternative — an unbounded queue — turns
 *      a database stall into heap exhaustion, which takes the application down
 *      to protect a log.
 *
 *   3. NEVER join the request's transaction. Writes happen on the writer
 *      thread, after the response has gone out, where there is no ambient
 *      transaction to join. A rolled-back business transaction still leaves
 *      its activity row, which is the whole point when recording failures.
 *
 * Rows are drained in batches because every request is recorded, reads
 * included: one insert per GET would double the statement count of the
 * application.
 */
@Service
public class ActivityRecorder {

    private static final Logger log = LoggerFactory.getLogger(ActivityRecorder.class);

    private static final int DRAIN_BATCH = 500;
    private static final long POLL_MILLIS = 200;

    private final ActivityLogRepository activityLogs;
    private final BlockingQueue<ActivityLog> queue;
    private final boolean async;
    private final AtomicLong dropped = new AtomicLong();

    private volatile boolean running;
    private Thread writer;

    public ActivityRecorder(ActivityLogRepository activityLogs,
            @Value("${app.activity.queue-capacity:10000}") int queueCapacity,
            @Value("${app.activity.async:true}") boolean async) {
        this.activityLogs = activityLogs;
        this.queue = new ArrayBlockingQueue<>(Math.max(queueCapacity, 1));
        this.async = async;
    }

    /**
     * Hand a row over. Returns immediately; the caller is a request thread and
     * must not wait for a database.
     */
    public void record(ActivityLog row) {
        if (!async) {
            // Synchronous mode exists for tests, which cannot assert on a row
            // that a background thread has not written yet.
            persist(List.of(row));
            return;
        }
        if (!queue.offer(row)) {
            long total = dropped.incrementAndGet();
            // Log sparsely — if the queue is full, the last thing to do is
            // flood the log that is already under pressure.
            if (total == 1 || total % 1000 == 0) {
                log.warn("Activity queue full — {} row(s) dropped so far. "
                        + "The writer is behind, or the database is slow.", total);
            }
        }
    }

    /** Rows dropped because the queue was full, for tests and diagnostics. */
    public long droppedCount() {
        return dropped.get();
    }

    @PostConstruct
    void start() {
        if (!async) {
            return;
        }
        running = true;
        writer = new Thread(this::drainLoop, "activity-writer");
        // Daemon: a stuck writer must never hold the JVM open on shutdown.
        writer.setDaemon(true);
        writer.start();
    }

    @PreDestroy
    void stop() {
        running = false;
        if (writer != null) {
            writer.interrupt();
        }
        // Best effort: flush whatever is still queued so a clean shutdown does
        // not silently lose the last few seconds of activity.
        drainOnce();
    }

    private void drainLoop() {
        while (running) {
            try {
                ActivityLog first = queue.poll(POLL_MILLIS, TimeUnit.MILLISECONDS);
                if (first == null) {
                    continue;
                }
                List<ActivityLog> batch = new ArrayList<>(DRAIN_BATCH);
                batch.add(first);
                queue.drainTo(batch, DRAIN_BATCH - 1);
                persist(batch);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (RuntimeException e) {
                // A failed batch is dropped, not retried: retrying a bad row
                // forever would wedge the writer and starve every row behind
                // it. Losing an audit row is bad; losing the trail is worse.
                log.error("Activity batch failed and was dropped", e);
            }
        }
    }

    private void drainOnce() {
        List<ActivityLog> batch = new ArrayList<>();
        queue.drainTo(batch);
        if (!batch.isEmpty()) {
            try {
                persist(batch);
            } catch (RuntimeException e) {
                log.error("Final activity flush failed", e);
            }
        }
    }

    /**
     * Deliberately NOT annotated @Transactional. This is called from inside
     * this class (the writer loop, and record() in synchronous mode), and a
     * self-invocation never passes through the transaction proxy — the
     * annotation would read as a guarantee while doing nothing at all.
     *
     * The guarantee comes from the repository instead: saveAll is itself
     * transactional, so a batch commits or rolls back as one, in a
     * transaction of its own. On the writer thread there is no ambient
     * transaction to accidentally join.
     */
    private void persist(List<ActivityLog> batch) {
        activityLogs.saveAll(batch);
    }
}
