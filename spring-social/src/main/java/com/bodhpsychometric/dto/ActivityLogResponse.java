package com.bodhpsychometric.dto;

import java.time.OffsetDateTime;

import com.bodhpsychometric.model.activity.ActivityLog;
import com.bodhpsychometric.model.activity.enums.ActivityOutcome;

/**
 * One row of the activity viewer. Flat by design — the table it comes from
 * holds no relations, deliberately, so an audit row outlives the account it
 * describes.
 *
 * actorEmail is the snapshot taken at the time of the request, not a lookup of
 * who that id belongs to now: renaming or deleting an account must not rewrite
 * history.
 */
public record ActivityLogResponse(
        Long activityLogId,
        String requestId,
        OffsetDateTime occurredAt,
        Long actorUserId,
        String actorEmail,
        boolean actorSuperAdmin,
        String method,
        String path,
        String pathTemplate,
        String queryString,
        int httpStatus,
        ActivityOutcome outcome,
        String errorMessage,
        int durationMs,
        String ip,
        String userAgent) {

    public static ActivityLogResponse from(ActivityLog row) {
        return new ActivityLogResponse(
                row.getActivityLogId(),
                row.getRequestId(),
                row.getOccurredAt(),
                row.getActorUserId(),
                row.getActorEmail(),
                row.isActorSuperAdmin(),
                row.getMethod(),
                row.getPath(),
                row.getPathTemplate(),
                row.getQueryString(),
                row.getHttpStatus(),
                row.getOutcome(),
                row.getErrorMessage(),
                row.getDurationMs(),
                row.getIp(),
                row.getUserAgent());
    }
}
