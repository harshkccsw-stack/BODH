package com.bodhpsychometric.controller.report;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.ItemBindingPreviewResponse;
import com.bodhpsychometric.dto.ItemBindingResponse;
import com.bodhpsychometric.dto.ItemMasterImportRequest;
import com.bodhpsychometric.service.report.ItemBindingService;

import jakarta.validation.Valid;

/**
 * The item dictionary — what {@code I1} and {@code V3} mean on one assessment.
 *
 * <p>Its own root rather than a branch of {@code /api/report-rules}, because a
 * binding is not a rule: it is never evaluated, it has no versions, and it is
 * read at authoring time to turn an item code into a column key.
 */
@RequestMapping("/api/report-item-bindings")
@RestController
public class ReportItemBindingController {

    @Autowired
    private ItemBindingService bindings;

    @GetMapping("/getByAssessment/{assessmentId}")
    public List<ItemBindingResponse> getByAssessment(@PathVariable Long assessmentId) {
        return bindings.listFor(assessmentId);
    }

    /** What the sheet would do, written to nothing. */
    @PostMapping("/import/preview")
    public ItemBindingPreviewResponse preview(@Valid @RequestBody ItemMasterImportRequest request) {
        return bindings.preview(request);
    }

    /** All or nothing; refuses with 409 if the preview found anything blocking. */
    @PostMapping("/import")
    public List<ItemBindingResponse> importAll(
            @Valid @RequestBody ItemMasterImportRequest request) {
        return bindings.importAll(request);
    }
}
