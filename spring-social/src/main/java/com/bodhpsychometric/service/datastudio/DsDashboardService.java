package com.bodhpsychometric.service.datastudio;

import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.DsDashboardRequest;
import com.bodhpsychometric.dto.DsDashboardResponse;
import com.bodhpsychometric.dto.DsWidgetRequest;
import com.bodhpsychometric.dto.DsWidgetResponse;
import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.model.datastudio.DsDashboard;
import com.bodhpsychometric.model.datastudio.DsSheet;
import com.bodhpsychometric.model.datastudio.DsWidget;
import com.bodhpsychometric.model.datastudio.DsWorkbook;
import com.bodhpsychometric.repository.datastudio.DsDashboardRepository;
import com.bodhpsychometric.repository.datastudio.DsWidgetRepository;
import com.bodhpsychometric.security.RequestActor;

/**
 * Dashboards and their tiles. Access is never checked against the dashboard
 * itself — always against the WORKBOOK it belongs to, which is the only thing
 * anybody was ever granted rights on. A dashboard id is therefore not a way
 * around a share.
 */
@Service
@Transactional
public class DsDashboardService {

    /** Closed set: an unknown type would render as an empty tile forever. */
    private static final Set<String> WIDGET_TYPES = Set.of("CHART", "KPI", "TABLE", "PIVOT", "TEXT");

    private final DsDashboardRepository dashboards;
    private final DsWidgetRepository widgets;
    private final DsWorkbookService workbooks;
    private final DsSheetService sheetService;
    private final DataStudioAccess access;
    private final DsMapper mapper;
    private final DsJson json;

    public DsDashboardService(DsDashboardRepository dashboards,
            DsWidgetRepository widgets,
            DsWorkbookService workbooks,
            DsSheetService sheetService,
            DataStudioAccess access,
            DsMapper mapper,
            DsJson json) {
        this.dashboards = dashboards;
        this.widgets = widgets;
        this.workbooks = workbooks;
        this.sheetService = sheetService;
        this.access = access;
        this.mapper = mapper;
        this.json = json;
    }

    /* ---------------- dashboards ---------------- */

    public DsDashboardResponse create(Long dsWorkbookId, DsDashboardRequest request) {
        RequestActor actor = access.requireActor();
        DsWorkbook workbook = workbooks.load(dsWorkbookId);
        access.requireWrite(workbook, actor);

        String name = request.name() == null ? "" : request.name().trim();
        if (name.isEmpty()) {
            throw new IllegalArgumentException("Dashboard name is required");
        }
        DsDashboard dashboard = new DsDashboard();
        dashboard.setWorkbook(workbook);
        dashboard.setName(name);
        dashboard.setLayout(json.write(request.layout()));
        dashboard.setSortOrder((int) dashboards.countByWorkbook_DsWorkbookId(dsWorkbookId));
        return withWidgets(dashboards.save(dashboard));
    }

    @Transactional(readOnly = true)
    public DsDashboardResponse get(Long dsDashboardId) {
        RequestActor actor = access.requireActor();
        DsDashboard dashboard = load(dsDashboardId);
        access.requireRead(dashboard.getWorkbook(), actor);
        return withWidgets(dashboard);
    }

    /** Null fields are left alone — a drag saves the layout on its own. */
    public DsDashboardResponse update(Long dsDashboardId, DsDashboardRequest request) {
        RequestActor actor = access.requireActor();
        DsDashboard dashboard = load(dsDashboardId);
        access.requireWrite(dashboard.getWorkbook(), actor);

        if (request.name() != null && !request.name().isBlank()) {
            dashboard.setName(request.name().trim());
        }
        if (request.layout() != null) {
            dashboard.setLayout(json.write(request.layout()));
        }
        if (request.sortOrder() != null) {
            dashboard.setSortOrder(request.sortOrder());
        }
        return withWidgets(dashboards.save(dashboard));
    }

    public void delete(Long dsDashboardId) {
        RequestActor actor = access.requireActor();
        DsDashboard dashboard = load(dsDashboardId);
        access.requireWrite(dashboard.getWorkbook(), actor);
        // Tiles are true composition — a widget has no meaning without its
        // dashboard — so they go with it, and nothing else points at them.
        widgets.deleteByDashboard_DsDashboardId(dsDashboardId);
        dashboards.delete(dashboard);
    }

    /* ---------------- widgets ---------------- */

    public DsWidgetResponse addWidget(Long dsDashboardId, DsWidgetRequest request) {
        RequestActor actor = access.requireActor();
        DsDashboard dashboard = load(dsDashboardId);
        access.requireWrite(dashboard.getWorkbook(), actor);

        String type = request.type() == null ? "" : request.type().trim().toUpperCase(Locale.ROOT);
        if (!WIDGET_TYPES.contains(type)) {
            throw new IllegalArgumentException("Widget type must be one of " + WIDGET_TYPES);
        }

        DsWidget widget = new DsWidget();
        widget.setDashboard(dashboard);
        widget.setType(type);
        widget.setSheet(resolveSheet(request.sheetId(), dashboard.getWorkbook()));
        widget.setConfig(json.write(request.config()));
        widget.setPosX(request.posX());
        widget.setPosY(request.posY());
        widget.setW(request.w() == null ? 6 : request.w());
        widget.setH(request.h());
        widget.setSortOrder(request.sortOrder() == null
                ? (int) widgets.countByDashboard_DsDashboardId(dsDashboardId)
                : request.sortOrder());
        return mapper.toWidget(widgets.save(widget));
    }

    /**
     * Resize, reorder, rebind or reconfigure one tile. {@code type} is
     * deliberately NOT updatable: a config written for a chart cannot be read
     * by a KPI, so switching in place would leave a tile that renders nothing
     * and looks broken. The UI deletes and re-adds instead.
     */
    public DsWidgetResponse updateWidget(Long dsWidgetId, DsWidgetRequest request) {
        RequestActor actor = access.requireActor();
        DsWidget widget = widgets.findWithWorkbook(dsWidgetId)
                .orElseThrow(() -> new NotFoundException("Widget " + dsWidgetId + " not found"));
        DsWorkbook workbook = widget.getDashboard().getWorkbook();
        access.requireWrite(workbook, actor);

        if (request.sheetId() != null) {
            widget.setSheet(resolveSheet(request.sheetId(), workbook));
        }
        if (request.config() != null) {
            widget.setConfig(json.write(request.config()));
        }
        if (request.posX() != null) {
            widget.setPosX(request.posX());
        }
        if (request.posY() != null) {
            widget.setPosY(request.posY());
        }
        if (request.w() != null) {
            widget.setW(request.w());
        }
        if (request.h() != null) {
            widget.setH(request.h());
        }
        if (request.sortOrder() != null) {
            widget.setSortOrder(request.sortOrder());
        }
        return mapper.toWidget(widgets.save(widget));
    }

    public void deleteWidget(Long dsWidgetId) {
        RequestActor actor = access.requireActor();
        DsWidget widget = widgets.findWithWorkbook(dsWidgetId)
                .orElseThrow(() -> new NotFoundException("Widget " + dsWidgetId + " not found"));
        access.requireWrite(widget.getDashboard().getWorkbook(), actor);
        widgets.delete(widget);
    }

    /* ---------------- helpers ---------------- */

    @Transactional(readOnly = true)
    public DsDashboard load(Long dsDashboardId) {
        return dashboards.findWithWorkbook(dsDashboardId)
                .orElseThrow(() -> new NotFoundException("Dashboard " + dsDashboardId + " not found"));
    }

    /**
     * A tile may only bind to a sheet in its OWN workbook. Checked here rather
     * than trusted from the body: a cross-workbook binding would render rows
     * the viewer of this dashboard was never granted, using an access check
     * that only ever looked at the dashboard's side.
     */
    private DsSheet resolveSheet(Long dsSheetId, DsWorkbook workbook) {
        if (dsSheetId == null) {
            return null;
        }
        DsSheet sheet = sheetService.load(dsSheetId);
        if (!sheet.getWorkbook().getDsWorkbookId().equals(workbook.getDsWorkbookId())) {
            throw new IllegalArgumentException(
                    "Sheet " + dsSheetId + " belongs to a different workbook");
        }
        return sheet;
    }

    private DsDashboardResponse withWidgets(DsDashboard dashboard) {
        List<DsWidget> tiles = widgets.findByDashboard_DsDashboardIdOrderBySortOrderAscDsWidgetIdAsc(
                dashboard.getDsDashboardId());
        return mapper.toDashboard(dashboard, tiles);
    }
}
