package com.bodhpsychometric.config;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Gives every request an id, so the three places a failure shows up can be
 * tied together: the log lines (the id rides in the level pattern — see
 * application.yml), the 500 body {@link com.bodhpsychometric.exception.ApiExceptionHandler}
 * returns, and the activity trail when that lands. A user reporting "it said
 * error 9f2c…" is then one grep.
 *
 * Runs first so the id exists before anything can fail. An inbound
 * X-Request-Id is honoured — a proxy or the frontend may already have one —
 * but only after sanitising: the value reaches both the log file and a
 * response header, and an unchecked one would let a caller forge log lines
 * (CR/LF) or inject a header.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    /** MDC key; %X{requestId} in the logging pattern reads this. */
    public static final String MDC_KEY = "requestId";

    public static final String HEADER = "X-Request-Id";

    private static final int MAX_LENGTH = 64;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        String requestId = sanitized(request.getHeader(HEADER));
        if (requestId == null) {
            requestId = UUID.randomUUID().toString();
        }
        MDC.put(MDC_KEY, requestId);
        response.setHeader(HEADER, requestId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            // Threads are pooled — a stale id here would mislabel the next
            // request served by this one.
            MDC.remove(MDC_KEY);
        }
    }

    /** The id we accept from a caller: printable, bounded, no separators. */
    private static String sanitized(String candidate) {
        if (candidate == null || candidate.isBlank() || candidate.length() > MAX_LENGTH) {
            return null;
        }
        for (int i = 0; i < candidate.length(); i++) {
            char c = candidate.charAt(i);
            boolean allowed = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9') || c == '-' || c == '_';
            if (!allowed) {
                return null;
            }
        }
        return candidate;
    }

    /** The current request's id, or null outside a request. */
    public static String current() {
        return MDC.get(MDC_KEY);
    }
}
