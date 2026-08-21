package com.bodhpsychometric.dto;

import java.util.Map;

/** One dashboard tile, config included. */
public record DsWidgetResponse(
        Long dsWidgetId,
        Long dsDashboardId,
        String type,
        Long dsSheetId,
        Map<String, Object> config,
        Integer posX,
        Integer posY,
        Integer w,
        Integer h,
        int sortOrder) {
}
