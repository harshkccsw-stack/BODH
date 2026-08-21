package com.bodhpsychometric.dto;

import java.util.List;
import java.util.Map;

/**
 * A sheet's DEFINITION — never its rows. Rows come from
 * {@code /api/data-studio/sheets/getData/{id}}, which re-pulls them live and
 * recomputes every formula, so nothing cached here can go stale against the
 * answers.
 */
public record DsSheetResponse(
        Long dsSheetId,
        Long dsWorkbookId,
        String name,
        String sourceView,
        Map<String, Object> sourceFilters,
        String grain,
        Map<String, Object> displayState,
        int sortOrder,
        List<DsColumnResponse> derivedColumns,
        String createdAt,
        String updatedAt) {
}
