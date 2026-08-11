package com.bodhpsychometric.security;

/**
 * Who is making the current request, as resolved from the bearer token.
 *
 * {@link #ANONYMOUS} is a first-class value rather than a null, because
 * anonymous is a normal outcome here and not an error: with
 * app.security.require-auth off, an unauthenticated call is served exactly as
 * before and simply logged without a who. Callers therefore never have to
 * null-check, and the activity trail records "anonymous" instead of losing
 * the row.
 *
 * Built purely from the token's own claims — no database round trip — so
 * resolving it on every request costs nothing.
 */
public record RequestActor(Long userId, String email, boolean superAdmin) {

    public static final RequestActor ANONYMOUS = new RequestActor(null, null, false);

    public boolean isAuthenticated() {
        return userId != null;
    }

    /**
     * What goes in a log line and the activity trail: the id, never the
     * email. Emails in log files are PII we would then have to manage.
     */
    public String label() {
        return userId == null ? "anonymous" : String.valueOf(userId);
    }
}
