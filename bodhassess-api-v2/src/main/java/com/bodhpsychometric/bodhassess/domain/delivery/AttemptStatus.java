package com.bodhpsychometric.bodhassess.domain.delivery;

/**
 * Lifecycle of one attempt. The legacy system stored only "Active" /
 * "Completed" strings; NOT_STARTED vs IN_PROGRESS is split by whether the
 * taker has submitted a first answer (startedAt).
 */
public enum AttemptStatus {
    NOT_STARTED,
    IN_PROGRESS,
    COMPLETED
}
