package com.bodhpsychometric.controller.datastudio;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.DsDatasetResponse;
import com.bodhpsychometric.dto.DsQueryRequest;
import com.bodhpsychometric.service.datastudio.DataStudioAccess;
import com.bodhpsychometric.service.datastudio.DataStudioDatasetService;
import com.bodhpsychometric.service.datastudio.DsQueryService;

/**
 * The two reads that are not about a saved definition: the raw dataset behind
 * an assessment, and grouped aggregation over it.
 */
@RequestMapping("/api/data-studio")
@RestController
public class DataStudioQueryController {

    @Autowired
    private DsQueryService queryService;

    @Autowired
    private DataStudioDatasetService datasetService;

    @Autowired
    private DataStudioAccess access;

    /**
     * Grouped aggregation — every KPI, chart and pivot is one of these. Give
     * a {@code dsSheetId} to query a sheet (its computed columns included), or
     * {@code sourceFilters.assessmentId} to query the raw dataset.
     */
    @PostMapping("/query")
    public DsDatasetResponse query(@RequestBody DsQueryRequest request) {
        return queryService.query(request);
    }

    /**
     * The raw grid for one assessment, before any sheet is involved — what the
     * "new sheet" dialog previews and what the column picker lists. 404 when
     * the assessment does not exist; an assessment nobody has been allotted
     * returns its columns and zero rows, which is an answer, not an error.
     *
     * <p>Any signed-in dashboard user may call this. It is the same data the
     * Reports area already exports, so gating it behind a workbook would only
     * mean you had to create one before you could look.
     */
    @GetMapping("/dataset/{assessmentId}")
    public ResponseEntity<?> dataset(@PathVariable Long assessmentId,
            @RequestParam(required = false) Long organizationId) {
        access.requireActor();
        return datasetService.dataset(assessmentId, organizationId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Assessment " + assessmentId + " not found")));
    }
}
