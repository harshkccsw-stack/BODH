package com.bodhpsychometric.bodhassess.analytics.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.analytics.payload.DashboardDto;
import com.bodhpsychometric.bodhassess.analytics.payload.DashboardRequests.CreateDashboard;
import com.bodhpsychometric.bodhassess.analytics.payload.DashboardRequests.SaveWidget;
import com.bodhpsychometric.bodhassess.analytics.payload.DashboardRequests.UpdateDashboard;
import com.bodhpsychometric.bodhassess.analytics.payload.WidgetDto;
import com.bodhpsychometric.bodhassess.analytics.service.DashboardService;
import com.bodhpsychometric.bodhassess.security.CurrentUser;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/**
 * Dashboards and their widgets. Dashboards are created under a workbook
 * ({@code POST /workbooks/{id}/dashboards}) and addressed directly thereafter.
 */
@RestController
@RequestMapping("/api/v1")
public class DashboardController {

    @Autowired
    private DashboardService service;

    @PostMapping("/workbooks/{workbookId}/dashboards")
    public ResponseEntity<DashboardDto> create(@CurrentUser UserPrincipal principal,
                                               @PathVariable Long workbookId,
                                               @RequestBody CreateDashboard req) {
        return new ResponseEntity<>(service.create(principal, workbookId, req), HttpStatus.CREATED);
    }

    @GetMapping("/dashboards/{id}")
    public DashboardDto get(@CurrentUser UserPrincipal principal, @PathVariable Long id) {
        return service.get(principal, id);
    }

    @PutMapping("/dashboards/{id}")
    public DashboardDto update(@CurrentUser UserPrincipal principal, @PathVariable Long id,
                               @RequestBody UpdateDashboard req) {
        return service.update(principal, id, req);
    }

    @DeleteMapping("/dashboards/{id}")
    public ResponseEntity<Void> delete(@CurrentUser UserPrincipal principal, @PathVariable Long id) {
        service.delete(principal, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/dashboards/{id}/widgets")
    public ResponseEntity<WidgetDto> addWidget(@CurrentUser UserPrincipal principal,
                                               @PathVariable Long id, @RequestBody SaveWidget req) {
        return new ResponseEntity<>(service.addWidget(principal, id, req), HttpStatus.CREATED);
    }

    @PutMapping("/widgets/{id}")
    public WidgetDto updateWidget(@CurrentUser UserPrincipal principal, @PathVariable Long id,
                                  @RequestBody SaveWidget req) {
        return service.updateWidget(principal, id, req);
    }

    @DeleteMapping("/widgets/{id}")
    public ResponseEntity<Void> deleteWidget(@CurrentUser UserPrincipal principal, @PathVariable Long id) {
        service.deleteWidget(principal, id);
        return ResponseEntity.noContent().build();
    }
}
