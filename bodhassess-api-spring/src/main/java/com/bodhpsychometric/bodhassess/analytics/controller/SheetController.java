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

import com.bodhpsychometric.bodhassess.analytics.payload.DerivedColumnDto;
import com.bodhpsychometric.bodhassess.analytics.payload.SheetDto;
import com.bodhpsychometric.bodhassess.analytics.payload.ValidateExprResponseDto;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookRequests.CreateSheet;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookRequests.SaveColumn;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookRequests.UpdateSheet;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookRequests.ValidateExpr;
import com.bodhpsychometric.bodhassess.analytics.service.SheetService;
import com.bodhpsychometric.bodhassess.security.CurrentUser;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/**
 * Sheets and their derived columns. Sheets are created under a workbook
 * ({@code POST /workbooks/{id}/sheets}) but addressed directly thereafter
 * ({@code /sheets/{id}}), matching the Data Studio API contract.
 */
@RestController
@RequestMapping("/api/v1")
public class SheetController {

    @Autowired
    private SheetService service;

    @PostMapping("/workbooks/{workbookId}/sheets")
    public ResponseEntity<SheetDto> create(@CurrentUser UserPrincipal principal,
                                           @PathVariable Long workbookId,
                                           @RequestBody CreateSheet req) {
        return new ResponseEntity<>(service.create(principal, workbookId, req), HttpStatus.CREATED);
    }

    @GetMapping("/sheets/{id}")
    public SheetDto get(@CurrentUser UserPrincipal principal, @PathVariable Long id) {
        return service.get(principal, id);
    }

    @PutMapping("/sheets/{id}")
    public SheetDto update(@CurrentUser UserPrincipal principal, @PathVariable Long id,
                           @RequestBody UpdateSheet req) {
        return service.update(principal, id, req);
    }

    @DeleteMapping("/sheets/{id}")
    public ResponseEntity<Void> delete(@CurrentUser UserPrincipal principal, @PathVariable Long id) {
        service.delete(principal, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/sheets/{id}/validate-expr")
    public ValidateExprResponseDto validateExpr(@CurrentUser UserPrincipal principal,
                                                @PathVariable Long id,
                                                @RequestBody ValidateExpr req) {
        return service.validateExpr(principal, id, req == null ? null : req.getExpr());
    }

    @PostMapping("/sheets/{id}/columns")
    public ResponseEntity<DerivedColumnDto> addColumn(@CurrentUser UserPrincipal principal,
                                                      @PathVariable Long id,
                                                      @RequestBody SaveColumn req) {
        return new ResponseEntity<>(service.saveColumn(principal, id, req), HttpStatus.CREATED);
    }

    @PutMapping("/sheets/{id}/columns/{colKey}")
    public DerivedColumnDto updateColumn(@CurrentUser UserPrincipal principal,
                                         @PathVariable Long id, @PathVariable String colKey,
                                         @RequestBody SaveColumn req) {
        if (req != null) req.setColKey(colKey);
        return service.saveColumn(principal, id, req);
    }

    @DeleteMapping("/sheets/{id}/columns/{colKey}")
    public ResponseEntity<Void> deleteColumn(@CurrentUser UserPrincipal principal,
                                             @PathVariable Long id, @PathVariable String colKey) {
        service.deleteColumn(principal, id, colKey);
        return ResponseEntity.noContent().build();
    }
}
