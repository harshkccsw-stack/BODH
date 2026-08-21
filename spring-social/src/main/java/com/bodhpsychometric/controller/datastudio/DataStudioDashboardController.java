package com.bodhpsychometric.controller.datastudio;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.DsDashboardRequest;
import com.bodhpsychometric.dto.DsDashboardResponse;
import com.bodhpsychometric.dto.DsWidgetRequest;
import com.bodhpsychometric.dto.DsWidgetResponse;
import com.bodhpsychometric.service.datastudio.DsDashboardService;

import jakarta.validation.Valid;

/**
 * Dashboards and their tiles. Both live under {@code /api/data-studio} — a
 * widget gets its own top-level path because the canvas resizes and reorders
 * tiles constantly and threading the dashboard id through every one of those
 * calls buys nothing (the service reaches the workbook through the tile
 * anyway, and that is where access is checked).
 */
@RequestMapping("/api/data-studio")
@RestController
public class DataStudioDashboardController {

    @Autowired
    private DsDashboardService dashboardService;

    @PostMapping("/dashboards/create/{workbookId}")
    public DsDashboardResponse create(@PathVariable Long workbookId,
            @Valid @RequestBody DsDashboardRequest request) {
        return dashboardService.create(workbookId, request);
    }

    @GetMapping("/dashboards/getById/{id}")
    public DsDashboardResponse getById(@PathVariable Long id) {
        return dashboardService.get(id);
    }

    /** Null fields are left alone — a drag saves the layout on its own. */
    @PutMapping("/dashboards/update/{id}")
    public DsDashboardResponse update(@PathVariable Long id,
            @Valid @RequestBody DsDashboardRequest request) {
        return dashboardService.update(id, request);
    }

    @DeleteMapping("/dashboards/delete/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        dashboardService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/dashboards/{id}/widgets/create")
    public DsWidgetResponse addWidget(@PathVariable Long id,
            @Valid @RequestBody DsWidgetRequest request) {
        return dashboardService.addWidget(id, request);
    }

    /** Resize, reorder, rebind or reconfigure. The type is not changeable. */
    @PutMapping("/widgets/update/{id}")
    public DsWidgetResponse updateWidget(@PathVariable Long id,
            @Valid @RequestBody DsWidgetRequest request) {
        return dashboardService.updateWidget(id, request);
    }

    @DeleteMapping("/widgets/delete/{id}")
    public ResponseEntity<Void> deleteWidget(@PathVariable Long id) {
        dashboardService.deleteWidget(id);
        return ResponseEntity.noContent().build();
    }
}
