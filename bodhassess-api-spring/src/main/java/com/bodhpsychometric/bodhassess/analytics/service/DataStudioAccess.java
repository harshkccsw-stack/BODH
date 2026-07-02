package com.bodhpsychometric.bodhassess.analytics.service;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import com.bodhpsychometric.bodhassess.analytics.model.DsWorkbook;
import com.bodhpsychometric.bodhassess.analytics.model.DsWorkbookShare;
import com.bodhpsychometric.bodhassess.analytics.repository.DsWorkbookShareRepository;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/**
 * Central access policy for Data Studio. A workbook is reachable by its owner,
 * any expert it's shared with (EDITOR/VIEWER), or an admin. Entities are an
 * analysis dimension, never a tenancy boundary — there is no entity-based gate
 * here by design.
 */
@Service
public class DataStudioAccess {

    public static final String OWNER = "OWNER";
    public static final String EDITOR = "EDITOR";
    public static final String VIEWER = "VIEWER";
    public static final String ADMIN = "ADMIN";
    public static final String NONE = "NONE";

    @Autowired
    private DsWorkbookShareRepository shareRepo;

    /** Caller's effective access level on a workbook, or NONE. */
    public String levelOf(DsWorkbook wb, UserPrincipal principal) {
        if (principal == null || principal.getId() == null) return NONE;
        if (isAdmin(principal)) return ADMIN;
        if (principal.getId().equals(wb.getOwnerId())) return OWNER;
        Optional<DsWorkbookShare> share =
                shareRepo.findByWorkbookIdAndSharedWithUserId(wb.getId(), principal.getId());
        return share.map(DsWorkbookShare::getRole).orElse(NONE);
    }

    public boolean canRead(String level) { return !NONE.equals(level); }

    public boolean canWrite(String level) {
        return OWNER.equals(level) || EDITOR.equals(level) || ADMIN.equals(level);
    }

    /** Owner-only operations: delete workbook, manage shares. Admins included. */
    public boolean canManage(String level) {
        return OWNER.equals(level) || ADMIN.equals(level);
    }

    public String requireRead(DsWorkbook wb, UserPrincipal principal) {
        String level = levelOf(wb, principal);
        if (!canRead(level)) throw new AccessDeniedException("You do not have access to this workbook.");
        return level;
    }

    public String requireWrite(DsWorkbook wb, UserPrincipal principal) {
        String level = levelOf(wb, principal);
        if (!canWrite(level)) throw new AccessDeniedException("You do not have edit access to this workbook.");
        return level;
    }

    public String requireManage(DsWorkbook wb, UserPrincipal principal) {
        String level = levelOf(wb, principal);
        if (!canManage(level)) throw new AccessDeniedException("Only the workbook owner can do that.");
        return level;
    }

    /** Data Studio is for practitioners/experts and admins, not respondents. */
    public void requireExpert(UserPrincipal principal) {
        if (principal == null
                || principal.getUserType() == UserPrincipal.UserType.RESPONDENT) {
            throw new AccessDeniedException("Data Studio is available to practitioners only.");
        }
    }

    private boolean isAdmin(UserPrincipal principal) {
        return principal.getUserType() == UserPrincipal.UserType.ADMIN;
    }
}
