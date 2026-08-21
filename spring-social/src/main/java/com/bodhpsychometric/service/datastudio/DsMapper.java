package com.bodhpsychometric.service.datastudio;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.stereotype.Component;

import com.bodhpsychometric.dto.DsColumnResponse;
import com.bodhpsychometric.dto.DsDashboardResponse;
import com.bodhpsychometric.dto.DsSheetResponse;
import com.bodhpsychometric.dto.DsWidgetResponse;
import com.bodhpsychometric.model.datastudio.DsDashboard;
import com.bodhpsychometric.model.datastudio.DsDerivedColumn;
import com.bodhpsychometric.model.datastudio.DsSheet;
import com.bodhpsychometric.model.datastudio.DsWidget;

/**
 * Entity → response for the Data Studio definitions. Kept separate from the
 * services because a sheet is rendered by three of them (its own, the
 * workbook's fetch, and the dashboard's sheet picker) and a private copy in
 * each is how two of them end up disagreeing.
 *
 * <p>Children are passed in rather than read here: the caller already has them
 * loaded in the order it wants, and a mapper that queried would turn one
 * workbook fetch into a query per sheet.
 */
@Component
public class DsMapper {

    private final DsJson json;

    public DsMapper(DsJson json) {
        this.json = json;
    }

    public DsSheetResponse toSheet(DsSheet sheet, List<DsDerivedColumn> columns) {
        return new DsSheetResponse(
                sheet.getDsSheetId(),
                sheet.getWorkbook().getDsWorkbookId(),
                sheet.getName(),
                sheet.getSourceView(),
                json.read(sheet.getSourceFilters()),
                sheet.getGrain(),
                json.read(sheet.getDisplayState()),
                sheet.getSortOrder(),
                columns.stream().map(DsColumnResponse::from).toList(),
                iso(sheet.getCreatedAt()),
                iso(sheet.getUpdatedAt()));
    }

    public DsDashboardResponse toDashboard(DsDashboard dashboard, List<DsWidget> widgets) {
        return new DsDashboardResponse(
                dashboard.getDsDashboardId(),
                dashboard.getWorkbook().getDsWorkbookId(),
                dashboard.getName(),
                json.read(dashboard.getLayout()),
                dashboard.getSortOrder(),
                widgets.stream().map(this::toWidget).toList(),
                iso(dashboard.getCreatedAt()),
                iso(dashboard.getUpdatedAt()));
    }

    public DsWidgetResponse toWidget(DsWidget widget) {
        return new DsWidgetResponse(
                widget.getDsWidgetId(),
                widget.getDashboard().getDsDashboardId(),
                widget.getType(),
                widget.getSheet() == null ? null : widget.getSheet().getDsSheetId(),
                json.read(widget.getConfig()),
                widget.getPosX(),
                widget.getPosY(),
                widget.getW(),
                widget.getH(),
                widget.getSortOrder());
    }

    private static String iso(OffsetDateTime at) {
        return at == null ? null : at.toString();
    }
}
