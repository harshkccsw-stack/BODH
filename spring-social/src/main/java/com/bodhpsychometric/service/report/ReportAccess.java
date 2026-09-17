package com.bodhpsychometric.service.report;

import org.springframework.stereotype.Service;

import com.bodhpsychometric.security.ActorFilter;
import com.bodhpsychometric.security.RequestActor;

/**
 * Who may touch the report engine — one place, so adding an endpoint cannot
 * accidentally add a way around it. Modelled on {@code DataStudioAccess}.
 *
 * <p>The app-wide switch this sits on top of, {@code app.security.require-auth},
 * <b>defaults to OFF</b>, so an untokened request normally reaches controllers
 * as anonymous. The report engine cannot work that way: generated reports are
 * the most sensitive artifact in the product — a named person's psychometric
 * profile — and a template is authored content somebody is accountable for.
 * So {@link #requireActor()} rejects anonymous <b>itself</b>, regardless of the
 * global flag, rather than waiting for it to be turned on.
 *
 * <p>P1 has one level: signed in. Templates are a shared library rather than
 * per-owner objects, so there is no owner check to make yet — the finer grain
 * (who may approve a definition, the separate-approver rule) arrives with
 * {@code report_definition} in P2, and lands here rather than in a controller.
 */
@Service
public class ReportAccess {

    /** Thrown when there is no signed-in user at all → 401. */
    public static class NotSignedInException extends RuntimeException {
        public NotSignedInException(String message) {
            super(message);
        }
    }

    /** Thrown when the caller is signed in but not permitted → 403. */
    public static class ForbiddenException extends RuntimeException {
        public ForbiddenException(String message) {
            super(message);
        }
    }

    /**
     * The signed-in caller. There is no anonymous mode here: a template
     * records who authored it, and a rendered report is somebody's clinical
     * profile.
     */
    public RequestActor requireActor() {
        RequestActor actor = ActorFilter.current();
        if (!actor.isAuthenticated()) {
            throw new NotSignedInException("Sign in to use the report engine");
        }
        return actor;
    }

    /**
     * Authoring: creating, editing and publishing templates. Separate from
     * {@link #requireActor()} by name so the P2 change that narrows it to a
     * role is a change in one method rather than a search for call sites.
     */
    public RequestActor requireAuthor() {
        return requireActor();
    }

    /** Rendering somebody's report. Same level today; named for the same reason. */
    public RequestActor requireRenderer() {
        return requireActor();
    }
}
