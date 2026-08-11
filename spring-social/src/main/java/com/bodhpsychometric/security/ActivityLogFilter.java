package com.bodhpsychometric.security;

import java.io.IOException;
import java.time.OffsetDateTime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

import com.bodhpsychometric.config.RequestIdFilter;
import com.bodhpsychometric.model.activity.ActivityLog;
import com.bodhpsychometric.model.activity.enums.ActivityOutcome;
import com.bodhpsychometric.service.ActivityRecorder;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Records every answered request into the activity trail.
 *
 * A filter rather than a HandlerInterceptor, because an interceptor only sees
 * requests that reached a controller — it would miss exactly the ones worth
 * recording: unknown endpoints, and the 401s ActorFilter itself returns. The
 * one thing a filter cannot know up front is which mapping matched, and that
 * turns out to be free: the DispatcherServlet leaves the pattern on the
 * request as an attribute, so it can be read AFTER the chain has run.
 *
 * Ordered after ActorFilter so the actor is already resolved, and around it in
 * the sense that a rejected request still exits through here and is recorded —
 * an anonymous 401 is a row, not a silence.
 *
 * Timing is measured around the chain, so it is the server's own latency, not
 * the client's.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class ActivityLogFilter extends OncePerRequestFilter {

    private static final int PATH_MAX = 512;
    private static final int QUERY_MAX = 1000;
    private static final int USER_AGENT_MAX = 255;
    private static final int ERROR_MAX = 500;

    private final ActivityRecorder recorder;
    private final boolean enabled;

    public ActivityLogFilter(ActivityRecorder recorder,
            @Value("${app.activity.enabled:true}") boolean enabled) {
        this.recorder = recorder;
        this.enabled = enabled;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Recording the activity viewer's own reads would make the trail a
        // record of people looking at the trail.
        return !enabled || request.getRequestURI().startsWith("/api/activity");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        long startedAt = System.nanoTime();
        Exception failure = null;
        try {
            filterChain.doFilter(request, response);
        } catch (Exception e) {
            // An exception that escapes this far never reached
            // ApiExceptionHandler, so this is the only place it gets recorded.
            // Rethrown untouched below — the container still owns the response.
            failure = e;
            throw e;
        } finally {
            try {
                recorder.record(build(request, response, startedAt, failure));
            } catch (RuntimeException e) {
                // The trail must never be the reason a request fails. There is
                // nowhere useful to report this, and reporting it into the
                // response would corrupt an otherwise fine answer.
                logger.warn("Failed to record activity", e);
            }
        }
    }

    private ActivityLog build(HttpServletRequest request, HttpServletResponse response,
            long startedAt, Exception failure) {
        RequestActor actor = readActor(request);
        int status = failure != null ? 500 : response.getStatus();

        ActivityLog row = new ActivityLog();
        row.setRequestId(RequestIdFilter.current());
        row.setOccurredAt(OffsetDateTime.now());

        row.setActorUserId(actor.userId());
        row.setActorEmail(actor.email());
        row.setActorSuperAdmin(actor.superAdmin());

        row.setMethod(request.getMethod());
        row.setPath(truncate(request.getRequestURI(), PATH_MAX));
        row.setPathTemplate(truncate(matchedPattern(request), 255));
        row.setQueryString(truncate(request.getQueryString(), QUERY_MAX));

        row.setHttpStatus(status);
        row.setOutcome(ActivityOutcome.of(status));
        row.setErrorMessage(failure == null ? null
                : truncate(failure.getClass().getSimpleName() + ": " + failure.getMessage(), ERROR_MAX));
        row.setDurationMs((int) Math.min((System.nanoTime() - startedAt) / 1_000_000L, Integer.MAX_VALUE));

        row.setIp(clientIp(request));
        row.setUserAgent(truncate(request.getHeader(HttpHeaders.USER_AGENT), USER_AGENT_MAX));
        return row;
    }

    private static RequestActor readActor(HttpServletRequest request) {
        Object actor = request.getAttribute(ActorFilter.ATTRIBUTE);
        return actor instanceof RequestActor found ? found : RequestActor.ANONYMOUS;
    }

    /**
     * Null when nothing meaningful matched — a 404, or a request rejected
     * before routing.
     *
     * "/**" is treated as no match on purpose. An unknown URL still reaches
     * the static-resource handler, whose pattern is literally "/**", so
     * recording it verbatim would file every 404 in the system under one
     * meaningless template and make "group by endpoint" useless exactly where
     * it matters most.
     */
    private static String matchedPattern(HttpServletRequest request) {
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (pattern == null) {
            return null;
        }
        String template = pattern.toString();
        return "/**".equals(template) ? null : template;
    }

    /**
     * X-Forwarded-For's first entry when present — behind a proxy the socket
     * address is the proxy, which is the same for everyone and tells us
     * nothing. Trusted only as far as the deployment's own proxy: a direct
     * caller can set this header, so it is evidence, not proof.
     */
    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String first = forwarded.split(",")[0].trim();
            if (!first.isEmpty()) {
                return truncate(first, 45);
            }
        }
        return truncate(request.getRemoteAddr(), 45);
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
