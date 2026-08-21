package com.bodhpsychometric.dto;

import java.util.List;

/**
 * A workbook as the gallery card and the workbook page render it.
 *
 * <p>{@code access} is the CALLER's rights on this row — OWNER, EDITOR,
 * VIEWER or ADMIN — computed per request rather than stored, because it is a
 * property of who is asking and not of the workbook. The UI hides its edit
 * affordances on VIEWER; the server enforces the same thing independently, so
 * a hidden button is a courtesy, not the control.
 *
 * <p>The gallery listing sends empty child lists (it only needs the counts);
 * the single-workbook fetch fills them in.
 */
public record DsWorkbookResponse(
        Long dsWorkbookId,
        String name,
        String description,
        Long ownerUserId,
        String ownerEmail,
        String access,
        int sheetCount,
        int dashboardCount,
        List<DsSheetResponse> sheets,
        List<DsDashboardResponse> dashboards,
        List<DsShareResponse> shares,
        String createdAt,
        String updatedAt) {
}
