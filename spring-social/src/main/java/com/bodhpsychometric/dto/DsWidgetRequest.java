package com.bodhpsychometric.dto;

import java.util.Map;

/**
 * Create/update payload for a dashboard tile. {@code type} is required on
 * create and ignored on update — changing a chart into a KPI in place would
 * leave a config the new type cannot read, so the UI deletes and re-adds.
 *
 * <p>{@code sheetId} must name a sheet in the SAME workbook; the service
 * checks that rather than trusting the body, since a tile bound across
 * workbooks would leak rows past the access check on its own dashboard.
 */
public record DsWidgetRequest(
        String type,
        Long sheetId,
        Map<String, Object> config,
        Integer posX,
        Integer posY,
        Integer w,
        Integer h,
        Integer sortOrder) {
}
