package com.bodhpsychometric.model.activity.enums;

/**
 * How a request ended, derived from the status code. Stored alongside the
 * status rather than computed on read, so the viewer can filter "show me the
 * failures" without a range predicate on every row.
 */
public enum ActivityOutcome {

    /** 1xx–3xx. */
    SUCCESS,

    /** 4xx — the caller's mistake: bad input, missing token, a conflict. */
    CLIENT_ERROR,

    /** 5xx — ours. These are the rows worth an alert. */
    SERVER_ERROR;

    public static ActivityOutcome of(int httpStatus) {
        if (httpStatus >= 500) {
            return SERVER_ERROR;
        }
        return httpStatus >= 400 ? CLIENT_ERROR : SUCCESS;
    }
}
