package com.bodhpsychometric.controller.portal;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.PortalAttemptStatusResponse;
import com.bodhpsychometric.dto.PortalBeginRequest;
import com.bodhpsychometric.dto.PortalHeartbeat;
import com.bodhpsychometric.dto.PortalHeartbeatRequest;
import com.bodhpsychometric.dto.PortalProgressRequest;
import com.bodhpsychometric.dto.PortalProgressResponse;
import com.bodhpsychometric.dto.PortalSubmitRequest;
import com.bodhpsychometric.service.JwtService;
import com.bodhpsychometric.service.PortalAssessmentService;
import com.bodhpsychometric.service.PortalRedisStore;
import com.bodhpsychometric.service.SubmissionDigestService;

import io.jsonwebtoken.JwtException;

/**
 * Write side of the respondent take flow. Per attempt: begin (demographic
 * form + consent, NOT_STARTED → ONGOING), progress (partial-answer snapshot
 * to Redis, toggle-gated), submit (every answer at once, Redis-staged then
 * digested to MySQL — or written synchronously when Redis is away) — plus
 * abandon, the attention timer's exit (ONGOING → NOT_STARTED, partial
 * snapshot dropped, take it again). All rules live in
 * {@link PortalAssessmentService}.
 */
@RequestMapping("/api/portal")
@RestController
public class AnswerSubmissionController {

    @Autowired
    private PortalAssessmentService portalAssessmentService;

    @Autowired
    private SubmissionDigestService submissionDigestService;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PortalRedisStore portalRedisStore;

    @PostMapping("/assessments/begin/{mappingId}")
    public PortalAttemptStatusResponse begin(@PathVariable Long mappingId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) PortalBeginRequest request) {
        return portalAssessmentService.begin(authorization, mappingId, request);
    }

    /**
     * Stop an attempt and hand it back unstarted (ONGOING → NOT_STARTED).
     * Sent by the portal when the attention timer's budget runs out, so the
     * respondent can take the assessment again from the beginning — the
     * Redis partial-answer snapshot is dropped with it.
     */
    @PostMapping("/assessments/abandon/{mappingId}")
    public PortalAttemptStatusResponse abandon(@PathVariable Long mappingId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return portalAssessmentService.abandon(authorization, mappingId);
    }

    /**
     * Partial-answer snapshot: the FULL set of answers marked so far,
     * replacing the previous snapshot in Redis (1-day TTL). Only while the
     * assessment's savePartialAnswers toggle is on and the attempt is
     * ONGOING; {@code saved=false} means Redis was unavailable and the save
     * was skipped — not an error the respondent needs to see.
     */
    @PutMapping("/assessments/progress/{mappingId}")
    public PortalProgressResponse saveProgress(@PathVariable Long mappingId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) PortalProgressRequest request) {
        return portalAssessmentService.saveProgress(authorization, mappingId, request);
    }

    /**
     * Live-position ping for the tracking page: every ~10s and on every
     * question change while the respondent is on the questions screen.
     *
     * <p>Deliberately the ONE portal endpoint that never touches MySQL — at
     * ten thousand concurrent respondents this is the hottest path in the
     * system, so it is a bearer parse (in-memory HMAC) plus one Redis SET,
     * handled here rather than in the service to keep it visibly free of the
     * repositories. Ownership is NOT checked against the mapping on this
     * path; the tracking READ discards any heartbeat whose userId is not the
     * mapping's own respondent, which costs one comparison per page instead
     * of one query per ping. Excluded from the activity trail for the same
     * reason (see ActivityLogFilter).
     */
    @PostMapping("/assessments/heartbeat/{mappingId}")
    public ResponseEntity<Void> heartbeat(@PathVariable Long mappingId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) PortalHeartbeatRequest request) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        }
        Long userId;
        try {
            userId = jwtService.parseUserId(authorization.substring("Bearer ".length()));
        } catch (JwtException | IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        }
        portalRedisStore.writeHeartbeat(new PortalHeartbeat(
                mappingId,
                userId,
                clampToZero(request == null ? null : request.currentQuestion()),
                clampToZero(request == null ? null : request.answeredCount()),
                clampToZero(request == null ? null : request.totalQuestions()),
                System.currentTimeMillis()));
        return ResponseEntity.noContent().build();
    }

    private static int clampToZero(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }

    @PostMapping("/assessments/submit/{mappingId}")
    public PortalAttemptStatusResponse submit(@PathVariable Long mappingId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) PortalSubmitRequest request) {
        PortalAttemptStatusResponse response =
                portalAssessmentService.submit(authorization, mappingId, request);
        // Redis-staged: kick the digest NOW, off this thread, so the happy
        // path reaches MySQL within moments — the sweeper is only the net.
        // Fired from the controller rather than inside the service to keep
        // the service ↔ digest dependency one-directional.
        if (response.submissionPending()) {
            submissionDigestService.digestAsync(mappingId);
        }
        return response;
    }
}
