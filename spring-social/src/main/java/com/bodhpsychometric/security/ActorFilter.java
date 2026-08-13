package com.bodhpsychometric.security;

import java.io.IOException;
import java.util.List;

import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.bodhpsychometric.service.JwtService;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Resolves WHO is calling, on every request, and optionally enforces it.
 *
 * Two behaviours, one switch — app.security.require-auth:
 *
 *   false (default) — RESOLVE ONLY. A valid bearer becomes a
 *       {@link RequestActor}; anything else (absent, malformed, expired) is
 *       {@link RequestActor#ANONYMOUS}. Nothing is ever rejected, so turning
 *       this filter on changes no client behaviour at all. What it buys
 *       immediately is attribution: every log line of the request — and later
 *       every activity row — carries the actor, or "anonymous" when there
 *       isn't one.
 *
 *   true — ENFORCE. Same resolution, but a request that resolved to anonymous
 *       and is not on the public list is answered 401 here and never reaches a
 *       controller.
 *
 * The flag exists because flipping enforcement is the risky half: any page
 * still calling without a token breaks the moment it goes on. Keeping it a
 * property means the switch (and the rollback) is a restart, not a deploy.
 *
 * Runs immediately after RequestIdFilter, so a rejection is still logged
 * against a request id.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class ActorFilter extends OncePerRequestFilter {

    /** Request attribute the actor is stored under. */
    public static final String ATTRIBUTE = "bodh.requestActor";

    /** MDC key; %X{actor} in the logging pattern reads this. */
    public static final String MDC_KEY = "actor";

    private static final String BEARER = "Bearer ";

    /**
     * Endpoints that must work without a token even when enforcement is on:
     * the three sign-in doors, self-registration, and the link-resolve the
     * registration page calls before anyone has an account. OPTIONS is always
     * allowed — browsers send no Authorization on a CORS preflight, so
     * rejecting it would break every cross-origin call before it happened.
     *
     * Portal endpoints are deliberately NOT here. They carry a respondent's
     * token, which this filter resolves like any other, and the controllers
     * do their own ownership checks on top.
     */
    private static final List<String> PUBLIC_PATTERNS = List.of(
            "/api/auth/login",
            "/api/portal/login",
            "/api/portal/register/**",
            "/api/registration-tokens/getByToken/**");

    private static final AntPathMatcher MATCHER = new AntPathMatcher();

    private final JwtService jwt;
    private final boolean requireAuth;

    public ActorFilter(JwtService jwt,
            @Value("${app.security.require-auth:false}") boolean requireAuth) {
        this.jwt = jwt;
        this.requireAuth = requireAuth;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        RequestActor actor = resolve(request);
        request.setAttribute(ATTRIBUTE, actor);
        MDC.put(MDC_KEY, actor.label());
        try {
            if (requireAuth && !actor.isAuthenticated() && !isPublic(request)) {
                reject(response);
                return;
            }
            filterChain.doFilter(request, response);
        } finally {
            // Threads are pooled — a stale actor would mislabel the next
            // request served by this one.
            MDC.remove(MDC_KEY);
        }
    }

    /**
     * A bad token is treated exactly like no token. It is the caller's
     * problem, not a server error, and with enforcement off it must not
     * change how the request is served.
     */
    private RequestActor resolve(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER)) {
            return RequestActor.ANONYMOUS;
        }
        try {
            JwtService.TokenClaims claims = jwt.parseClaims(header.substring(BEARER.length()));
            return new RequestActor(claims.userId(), claims.email(), claims.superAdmin());
        } catch (JwtException | IllegalArgumentException e) {
            return RequestActor.ANONYMOUS;
        }
    }

    private boolean isPublic(HttpServletRequest request) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String path = request.getRequestURI();
        return PUBLIC_PATTERNS.stream().anyMatch(pattern -> MATCHER.match(pattern, path));
    }

    /**
     * Written by hand rather than thrown: a filter sits outside the
     * DispatcherServlet, so ApiExceptionHandler never sees this. The body
     * still matches the {"message": ...} shape every other error uses,
     * because that is what both frontends read.
     */
    private static void reject(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"message\":\"Sign in to continue\"}");
    }

    /** The current request's actor — never null, ANONYMOUS outside a request. */
    public static RequestActor current() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return RequestActor.ANONYMOUS;
        }
        Object actor = attributes.getAttribute(ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
        return actor instanceof RequestActor found ? found : RequestActor.ANONYMOUS;
    }
}
