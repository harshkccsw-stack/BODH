package com.bodhpsychometric.bodhassess.analytics.controller;

import java.util.List;

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

import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookDto;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookRequests.CreateWorkbook;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookRequests.ShareWorkbook;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookShareDto;
import com.bodhpsychometric.bodhassess.analytics.service.WorkbookService;
import com.bodhpsychometric.bodhassess.security.CurrentUser;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/** Data Studio workbooks: CRUD plus co-ownership (share) management. */
@RestController
@RequestMapping("/api/v1/workbooks")
public class WorkbookController {

    @Autowired
    private WorkbookService service;

    @GetMapping
    public List<WorkbookDto> list(@CurrentUser UserPrincipal principal) {
        return service.list(principal);
    }

    @PostMapping
    public ResponseEntity<WorkbookDto> create(@CurrentUser UserPrincipal principal,
                                              @RequestBody CreateWorkbook req) {
        return new ResponseEntity<>(service.create(principal, req), HttpStatus.CREATED);
    }

    @GetMapping("/{id}")
    public WorkbookDto get(@CurrentUser UserPrincipal principal, @PathVariable Long id) {
        return service.get(principal, id);
    }

    @PutMapping("/{id}")
    public WorkbookDto update(@CurrentUser UserPrincipal principal, @PathVariable Long id,
                              @RequestBody CreateWorkbook req) {
        return service.update(principal, id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@CurrentUser UserPrincipal principal, @PathVariable Long id) {
        service.delete(principal, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/shares")
    public ResponseEntity<WorkbookShareDto> addShare(@CurrentUser UserPrincipal principal,
                                                     @PathVariable Long id,
                                                     @RequestBody ShareWorkbook req) {
        return new ResponseEntity<>(service.addShare(principal, id, req), HttpStatus.CREATED);
    }

    @DeleteMapping("/{id}/shares/{userId}")
    public ResponseEntity<Void> removeShare(@CurrentUser UserPrincipal principal,
                                            @PathVariable Long id, @PathVariable String userId) {
        service.removeShare(principal, id, userId);
        return ResponseEntity.noContent().build();
    }
}
