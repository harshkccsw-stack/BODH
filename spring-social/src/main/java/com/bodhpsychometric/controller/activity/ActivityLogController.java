package com.bodhpsychometric.controller.activity;

import java.time.OffsetDateTime;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.ActivityLogResponse;
import com.bodhpsychometric.dto.ReportPageResponse;
import com.bodhpsychometric.model.activity.ActivityLog;
import com.bodhpsychometric.model.activity.enums.ActivityOutcome;
import com.bodhpsychometric.repository.activity.ActivityLogRepository;
import com.bodhpsychometric.security.ActorFilter;
import com.bodhpsychometric.security.RequestActor;

/**
 * Reads the activity trail. Super-admin only.
 *
 * This endpoint enforces its own gate REGARDLESS of app.security.require-auth.
 * That flag is a rollout control for the API as a whole; this table is not
 * something to leave open while that rollout finishes. It records which
 * respondents took which assessments and who looked at them — strictly more
 * sensitive than the data any other endpoint returns — so it refuses anonymous
 * and non-super-admin callers even while the rest of the API still answers
 * them.
 *
 * Read-only by construction: there is no write endpoint here, and there never
 * should be. Rows are written by ActivityLogFilter and removed only by
 * retention. An audit trail an operator can edit is not an audit trail.
 *
 * ActivityLogFilter skips /api/activity, so opening the viewer does not fill
 * the trail with a record of people reading the trail.
 */
@RestController
@RequestMapping("/api/activity")
@Transactional(readOnly = true)
public class ActivityLogController {

    /** Matches the reports area — a page can never be asked to return everything. */
    private static final int MAX_PAGE_SIZE = 200;

    @Autowired
    private ActivityLogRepository activityLogRepository;

    /**
     * The viewer's one query. Every filter is optional; search matches the
     * path or the actor's email (contains, case-insensitive). Newest first.
     */
    @GetMapping("/getAll")
    public ResponseEntity<?> getAll(
            @RequestParam(required = false) Long actorUserId,
            @RequestParam(required = false) ActivityOutcome outcome,
            @RequestParam(required = false) String method,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {

        ResponseEntity<?> denied = requireSuperAdmin();
        if (denied != null) {
            return denied;
        }

        String pattern = isBlank(search) ? null : "%" + search.trim().toLowerCase() + "%";
        // Ordering lives in the query (occurredAt desc, id desc), so the page
        // itself stays unsorted.
        Page<ActivityLog> result = activityLogRepository.findForViewer(
                actorUserId,
                outcome,
                isBlank(method) ? null : method.trim().toUpperCase(),
                from,
                to,
                pattern,
                PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE), Sort.unsorted()));

        return ResponseEntity.ok(ReportPageResponse.from(result.map(ActivityLogResponse::from)));
    }

    /**
     * 401 for "who are you", 403 for "I know you, and no" — the distinction
     * matters to the frontend, whose client logs a user out on 401 but not on
     * 403. Returns null when the caller may proceed.
     */
    private ResponseEntity<?> requireSuperAdmin() {
        RequestActor actor = ActorFilter.current();
        if (!actor.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Sign in to continue"));
        }
        if (!actor.superAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "The activity log is restricted to super admins"));
        }
        return null;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
