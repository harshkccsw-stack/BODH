package com.bodhpsychometric.dto;

import java.util.List;
import java.util.Map;

/** A dashboard with its tiles, in flow order. */
public record DsDashboardResponse(
        Long dsDashboardId,
        Long dsWorkbookId,
        String name,
        Map<String, Object> layout,
        int sortOrder,
        List<DsWidgetResponse> widgets,
        String createdAt,
        String updatedAt) {
}
