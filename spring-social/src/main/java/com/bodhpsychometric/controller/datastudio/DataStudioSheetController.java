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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.DsColumnRequest;
import com.bodhpsychometric.dto.DsColumnResponse;
import com.bodhpsychometric.dto.DsDatasetResponse;
import com.bodhpsychometric.dto.DsExprRequest;
import com.bodhpsychometric.dto.DsExprResponse;
import com.bodhpsychometric.dto.DsSheetRequest;
import com.bodhpsychometric.dto.DsSheetResponse;
import com.bodhpsychometric.service.datastudio.DsSheetService;

import jakarta.validation.Valid;

/**
 * Sheets and their computed columns.
 *
 * <p>{@code colKey} travels as a query parameter rather than a path segment
 * on purpose: a real key looks like {@code calc:z_anxiety}, and a colon in a
 * path is exactly the kind of thing that works locally and then does not
 * behind a proxy.
 */
@RequestMapping("/api/data-studio/sheets")
@RestController
public class DataStudioSheetController {

    @Autowired
    private DsSheetService sheetService;

    /**
     * A sheet is created inside a workbook, so the workbook is in the path.
     * The body must carry {@code sourceFilters.assessmentId} — that binding is
     * what a sheet IS, and one without it would open onto nothing.
     */
    @PostMapping("/create/{workbookId}")
    public DsSheetResponse create(@PathVariable Long workbookId,
            @Valid @RequestBody DsSheetRequest request) {
        return sheetService.create(workbookId, request);
    }

    /** The definition only — formulas and display state, never rows. */
    @GetMapping("/getById/{id}")
    public DsSheetResponse getById(@PathVariable Long id) {
        return sheetService.get(id);
    }

    /**
     * The rows: pulled live and recomputed on every call, so a sheet opened
     * today and the same sheet opened next month both show what the database
     * says at that moment. Nothing is cached between the two.
     */
    @GetMapping("/getData/{id}")
    public DsDatasetResponse getData(@PathVariable Long id) {
        return sheetService.data(id);
    }

    /** Every null field is left alone — the grid saves display state alone. */
    @PutMapping("/update/{id}")
    public DsSheetResponse update(@PathVariable Long id, @Valid @RequestBody DsSheetRequest request) {
        return sheetService.update(id, request);
    }

    /** 409 while a dashboard widget still binds to this sheet. */
    @DeleteMapping("/delete/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        sheetService.delete(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Type-check a formula as it is typed. Always 200 — a half-written
     * formula is a normal state, and its problems come back in the body.
     */
    @PostMapping("/{id}/validate-expr")
    public DsExprResponse validateExpr(@PathVariable Long id,
            @Valid @RequestBody DsExprRequest request) {
        return sheetService.validateExpr(id, request.expr());
    }

    @PostMapping("/{id}/columns/create")
    public DsColumnResponse createColumn(@PathVariable Long id,
            @Valid @RequestBody DsColumnRequest request) {
        return sheetService.saveColumn(id, null, request);
    }

    /**
     * Edits the label, formula and format of an existing column. The key does
     * NOT change — other formulas reference it, and renaming it under them
     * would break them silently.
     */
    @PutMapping("/{id}/columns/update")
    public DsColumnResponse updateColumn(@PathVariable Long id,
            @RequestParam String colKey,
            @Valid @RequestBody DsColumnRequest request) {
        return sheetService.saveColumn(id, colKey, request);
    }

    @DeleteMapping("/{id}/columns/delete")
    public ResponseEntity<Void> deleteColumn(@PathVariable Long id, @RequestParam String colKey) {
        sheetService.deleteColumn(id, colKey);
        return ResponseEntity.noContent().build();
    }
}
