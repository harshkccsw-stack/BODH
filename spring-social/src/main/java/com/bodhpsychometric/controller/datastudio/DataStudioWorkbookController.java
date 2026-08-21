package com.bodhpsychometric.controller.datastudio;

import java.util.List;

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

import com.bodhpsychometric.dto.DsShareRequest;
import com.bodhpsychometric.dto.DsShareResponse;
import com.bodhpsychometric.dto.DsWorkbookRequest;
import com.bodhpsychometric.dto.DsWorkbookResponse;
import com.bodhpsychometric.service.datastudio.DsWorkbookService;

import jakarta.validation.Valid;

/**
 * Data Studio workbooks — the gallery, one workbook, and who it is shared
 * with. Every rule lives in {@link DsWorkbookService}; nothing here decides
 * anything, including who is allowed to call it.
 */
@RequestMapping("/api/data-studio/workbooks")
@RestController
public class DataStudioWorkbookController {

    @Autowired
    private DsWorkbookService workbookService;

    /** The gallery: what the caller owns plus what has been shared with them. */
    @GetMapping("/getAll")
    public List<DsWorkbookResponse> getAll() {
        return workbookService.listVisible();
    }

    /** One workbook, with its sheets, dashboards and share list. */
    @GetMapping("/getById/{id}")
    public DsWorkbookResponse getById(@PathVariable Long id) {
        return workbookService.get(id);
    }

    @PostMapping("/create")
    public DsWorkbookResponse create(@Valid @RequestBody DsWorkbookRequest request) {
        return workbookService.create(request);
    }

    @PutMapping("/update/{id}")
    public DsWorkbookResponse update(@PathVariable Long id,
            @Valid @RequestBody DsWorkbookRequest request) {
        return workbookService.update(id, request);
    }

    /**
     * Deletes the workbook and everything in it. Destructive and not undoable
     * — the dashboard confirms first, and only the owner may call it.
     */
    @DeleteMapping("/delete/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        workbookService.delete(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Let another dashboard user in, or change the role of someone already in
     * — the same call does both, because "share with Priya as VIEWER" means
     * the same thing whether or not she is already an EDITOR.
     */
    @PostMapping("/{id}/shares/create")
    public DsShareResponse share(@PathVariable Long id, @Valid @RequestBody DsShareRequest request) {
        return workbookService.share(id, request);
    }

    @DeleteMapping("/{id}/shares/delete/{sharedWithUserId}")
    public ResponseEntity<Void> unshare(@PathVariable Long id, @PathVariable Long sharedWithUserId) {
        workbookService.unshare(id, sharedWithUserId);
        return ResponseEntity.noContent().build();
    }
}
