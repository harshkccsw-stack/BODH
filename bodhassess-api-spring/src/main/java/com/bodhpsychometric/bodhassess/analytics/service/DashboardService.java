package com.bodhpsychometric.bodhassess.analytics.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.analytics.model.DsDashboard;
import com.bodhpsychometric.bodhassess.analytics.model.DsWidget;
import com.bodhpsychometric.bodhassess.analytics.model.DsWorkbook;
import com.bodhpsychometric.bodhassess.analytics.payload.DashboardDto;
import com.bodhpsychometric.bodhassess.analytics.payload.DashboardRequests.CreateDashboard;
import com.bodhpsychometric.bodhassess.analytics.payload.DashboardRequests.SaveWidget;
import com.bodhpsychometric.bodhassess.analytics.payload.DashboardRequests.UpdateDashboard;
import com.bodhpsychometric.bodhassess.analytics.payload.WidgetDto;
import com.bodhpsychometric.bodhassess.analytics.repository.DsDashboardRepository;
import com.bodhpsychometric.bodhassess.analytics.repository.DsWidgetRepository;
import com.bodhpsychometric.bodhassess.analytics.repository.DsWorkbookRepository;
import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

@Service
@Transactional
public class DashboardService {

    private static final List<String> WIDGET_TYPES = List.of("CHART", "KPI", "TABLE", "PIVOT", "TEXT");

    @Autowired private DsDashboardRepository dashboards;
    @Autowired private DsWidgetRepository widgets;
    @Autowired private DsWorkbookRepository workbooks;
    @Autowired private DsMapper mapper;
    @Autowired private DataStudioAccess access;

    public DashboardDto create(UserPrincipal principal, Long workbookId, CreateDashboard req) {
        DsWorkbook wb = loadWorkbook(workbookId);
        access.requireWrite(wb, principal);
        if (req == null || !StringUtils.hasText(req.getName())) throw new BadRequestException("name is required");
        DsDashboard d = new DsDashboard();
        d.setWorkbookId(workbookId);
        d.setName(req.getName().trim());
        d.setSortOrder(dashboards.findByWorkbookIdOrderBySortOrderAscIdAsc(workbookId).size());
        return withWidgets(dashboards.save(d));
    }

    @Transactional(readOnly = true)
    public DashboardDto get(UserPrincipal principal, Long dashboardId) {
        DsDashboard d = loadDashboard(dashboardId);
        access.requireRead(loadWorkbook(d.getWorkbookId()), principal);
        return withWidgets(d);
    }

    /** Dashboards (with widgets) for a workbook — used to populate the workbook view. */
    @Transactional(readOnly = true)
    public List<DashboardDto> listForWorkbook(Long workbookId) {
        return dashboards.findByWorkbookIdOrderBySortOrderAscIdAsc(workbookId).stream()
                .map(this::withWidgets)
                .collect(Collectors.toList());
    }

    public DashboardDto update(UserPrincipal principal, Long dashboardId, UpdateDashboard req) {
        DsDashboard d = loadDashboard(dashboardId);
        access.requireWrite(loadWorkbook(d.getWorkbookId()), principal);
        if (req != null) {
            if (StringUtils.hasText(req.getName())) d.setName(req.getName().trim());
            if (req.getLayout() != null) d.setLayout(mapper.writeMap(req.getLayout()));
        }
        return withWidgets(dashboards.save(d));
    }

    public void delete(UserPrincipal principal, Long dashboardId) {
        DsDashboard d = loadDashboard(dashboardId);
        access.requireWrite(loadWorkbook(d.getWorkbookId()), principal);
        widgets.deleteByDashboardId(dashboardId);
        dashboards.deleteById(dashboardId);
    }

    /* ---------- widgets ---------- */

    public WidgetDto addWidget(UserPrincipal principal, Long dashboardId, SaveWidget req) {
        DsDashboard d = loadDashboard(dashboardId);
        access.requireWrite(loadWorkbook(d.getWorkbookId()), principal);
        if (req == null || !StringUtils.hasText(req.getType())) throw new BadRequestException("type is required");
        String type = req.getType().trim().toUpperCase();
        if (!WIDGET_TYPES.contains(type)) throw new BadRequestException("Unknown widget type: " + req.getType());

        DsWidget w = new DsWidget();
        w.setDashboardId(dashboardId);
        w.setType(type);
        w.setSheetId(req.getSheetId());
        w.setConfig(mapper.writeMap(req.getConfig()));
        w.setPosX(req.getPosX());
        w.setPosY(req.getPosY());
        w.setW(req.getW() == null ? 6 : req.getW());     // default half-width
        w.setH(req.getH() == null ? 1 : req.getH());
        w.setSortOrder(widgets.findByDashboardIdOrderBySortOrderAscIdAsc(dashboardId).size());
        return mapper.toWidgetDto(widgets.save(w));
    }

    public WidgetDto updateWidget(UserPrincipal principal, Long widgetId, SaveWidget req) {
        DsWidget w = widgets.findById(widgetId)
                .orElseThrow(() -> new ResourceNotFoundException("Widget", "id", widgetId));
        DsDashboard d = loadDashboard(w.getDashboardId());
        access.requireWrite(loadWorkbook(d.getWorkbookId()), principal);
        if (req != null) {
            if (StringUtils.hasText(req.getType())) {
                String type = req.getType().trim().toUpperCase();
                if (!WIDGET_TYPES.contains(type)) throw new BadRequestException("Unknown widget type: " + req.getType());
                w.setType(type);
            }
            if (req.getSheetId() != null) w.setSheetId(req.getSheetId());
            if (req.getConfig() != null) w.setConfig(mapper.writeMap(req.getConfig()));
            if (req.getPosX() != null) w.setPosX(req.getPosX());
            if (req.getPosY() != null) w.setPosY(req.getPosY());
            if (req.getW() != null) w.setW(req.getW());
            if (req.getH() != null) w.setH(req.getH());
            if (req.getSortOrder() != null) w.setSortOrder(req.getSortOrder());
        }
        return mapper.toWidgetDto(widgets.save(w));
    }

    public void deleteWidget(UserPrincipal principal, Long widgetId) {
        DsWidget w = widgets.findById(widgetId)
                .orElseThrow(() -> new ResourceNotFoundException("Widget", "id", widgetId));
        DsDashboard d = loadDashboard(w.getDashboardId());
        access.requireWrite(loadWorkbook(d.getWorkbookId()), principal);
        widgets.deleteById(widgetId);
    }

    /* ---------- helpers ---------- */

    private DashboardDto withWidgets(DsDashboard d) {
        DashboardDto dto = mapper.toDashboardDto(d);
        dto.setWidgets(widgets.findByDashboardIdOrderBySortOrderAscIdAsc(d.getId()).stream()
                .map(mapper::toWidgetDto).collect(Collectors.toList()));
        return dto;
    }

    private DsDashboard loadDashboard(Long id) {
        return dashboards.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Dashboard", "id", id));
    }

    private DsWorkbook loadWorkbook(Long id) {
        return workbooks.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Workbook", "id", id));
    }
}
