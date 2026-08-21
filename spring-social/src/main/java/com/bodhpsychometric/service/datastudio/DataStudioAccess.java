package com.bodhpsychometric.service.datastudio;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.model.datastudio.DsWorkbook;
import com.bodhpsychometric.model.datastudio.DsWorkbookShare;
import com.bodhpsychometric.repository.datastudio.DsWorkbookShareRepository;
import com.bodhpsychometric.security.ActorFilter;
import com.bodhpsychometric.security.RequestActor;

/**
 * Who may do what to a workbook — the one place that question is answered, so
 * that adding an endpoint cannot accidentally add a way around it.
 *
 * <p>Four levels, most to least: <b>ADMIN</b> (a super admin, who sees
 * everything), <b>OWNER</b> (created it; may also manage the share list),
 * <b>EDITOR</b> (a grant; may change sheets, columns, dashboards, widgets),
 * <b>VIEWER</b> (a grant; reads and runs queries only). Anyone else gets
 * NONE and is answered 404 rather than 403 — telling a stranger that workbook
 * 12 exists but is not theirs is itself a small leak, and there is no case
 * where they need to know the difference.
 *
 * <p>Sharing is deliberately the owner's act alone. An EDITOR cannot re-share,
 * which keeps the set of people who can reach a workbook to what the owner
 * actually decided rather than to whatever the graph of grants grew into.
 *
 * <p>Note the app-wide switch this sits on top of:
 * {@code app.security.require-auth} defaults to OFF, so an untokened request
 * normally reaches controllers as anonymous. Data Studio cannot work that way
 * — every row here is owned by somebody — so {@link #requireActor()} rejects
 * anonymous itself rather than waiting for the global flag to be turned on.
 */
@Service
public class DataStudioAccess {

    public static final String ADMIN = "ADMIN";
    public static final String OWNER = "OWNER";
    public static final String EDITOR = DsWorkbookShare.ROLE_EDITOR;
    public static final String VIEWER = DsWorkbookShare.ROLE_VIEWER;
    public static final String NONE = "NONE";

    private final DsWorkbookShareRepository shares;

    public DataStudioAccess(DsWorkbookShareRepository shares) {
        this.shares = shares;
    }

    /** Thrown when the caller has no business seeing this row at all → 404. */
    public static class NotVisibleException extends RuntimeException {
        public NotVisibleException(String message) {
            super(message);
        }
    }

    /** Thrown when the caller may see the row but not change it → 403. */
    public static class ReadOnlyException extends RuntimeException {
        public ReadOnlyException(String message) {
            super(message);
        }
    }

    /** Thrown when there is no signed-in user at all → 401. */
    public static class NotSignedInException extends RuntimeException {
        public NotSignedInException(String message) {
            super(message);
        }
    }

    /**
     * The signed-in caller. Data Studio has no anonymous mode: a workbook is
     * owned, and an anonymous create would have no owner to give it to.
     */
    public RequestActor requireActor() {
        RequestActor actor = ActorFilter.current();
        if (!actor.isAuthenticated()) {
            throw new NotSignedInException("Sign in to use Data Studio");
        }
        return actor;
    }

    /** The caller's level on this workbook, or {@link #NONE}. */
    @Transactional(readOnly = true)
    public String levelOf(DsWorkbook workbook, RequestActor actor) {
        if (actor.superAdmin()) {
            return ADMIN;
        }
        if (workbook.getOwner() != null && workbook.getOwner().getId().equals(actor.userId())) {
            return OWNER;
        }
        return shares.findRole(workbook.getDsWorkbookId(), actor.userId())
                .filter(role -> EDITOR.equals(role) || VIEWER.equals(role))
                .orElse(NONE);
    }

    /** Read access, or a 404. Returns the level so callers can echo it. */
    @Transactional(readOnly = true)
    public String requireRead(DsWorkbook workbook, RequestActor actor) {
        String level = levelOf(workbook, actor);
        if (NONE.equals(level)) {
            throw new NotVisibleException("Workbook " + workbook.getDsWorkbookId() + " not found");
        }
        return level;
    }

    /** Write access: a VIEWER is refused, a stranger is not even told it exists. */
    @Transactional(readOnly = true)
    public String requireWrite(DsWorkbook workbook, RequestActor actor) {
        String level = requireRead(workbook, actor);
        if (VIEWER.equals(level)) {
            throw new ReadOnlyException("You have view-only access to this workbook");
        }
        return level;
    }

    /** Managing the share list is the owner's (or a super admin's) act alone. */
    @Transactional(readOnly = true)
    public void requireOwner(DsWorkbook workbook, RequestActor actor) {
        String level = requireRead(workbook, actor);
        if (!OWNER.equals(level) && !ADMIN.equals(level)) {
            throw new ReadOnlyException("Only the workbook owner can change who it is shared with");
        }
    }
}
