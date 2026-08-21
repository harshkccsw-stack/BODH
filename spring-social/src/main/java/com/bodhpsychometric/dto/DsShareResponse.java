package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.datastudio.DsWorkbookShare;

/**
 * One co-ownership grant, as the workbook's share panel renders it. The
 * grantee's email is what identifies them on screen — an id alone would make
 * the list unreadable.
 */
public record DsShareResponse(
        Long dsWorkbookShareId,
        Long sharedWithUserId,
        String sharedWithEmail,
        String role,
        Long grantedByUserId,
        String createdAt) {

    public static DsShareResponse from(DsWorkbookShare share) {
        return new DsShareResponse(
                share.getDsWorkbookShareId(),
                share.getSharedWith().getId(),
                share.getSharedWith().getEmail(),
                share.getRole(),
                share.getGrantedByUserId(),
                share.getCreatedAt() == null ? null : share.getCreatedAt().toString());
    }
}
