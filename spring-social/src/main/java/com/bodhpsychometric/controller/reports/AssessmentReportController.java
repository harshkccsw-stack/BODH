package com.bodhpsychometric.controller.reports;

import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.ReportAssessmentOption;
import com.bodhpsychometric.dto.ReportOrganizationOption;
import com.bodhpsychometric.dto.ReportPageResponse;
import com.bodhpsychometric.dto.ReportRespondentRow;
import com.bodhpsychometric.service.AssessmentReportService;

/**
 * Reports area. Feeds the dashboard's Reports Hub: two paged filter dropdowns
 * (organizations, assessments), the paged respondent listing behind them, the
 * per-respondent info popup, and the one write in the area — resetting a
 * respondent's assessment so they can take it again. All rules live in
 * {@link AssessmentReportService}.
 */
@RequestMapping("/api/reports")
@RestController
public class AssessmentReportController {

    @Autowired
    private AssessmentReportService assessmentReportService;

    /** Organization dropdown — paged, searchable by name. */
    @GetMapping("/getOrganizations")
    public ReportPageResponse<ReportOrganizationOption> getOrganizations(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return assessmentReportService.organizationOptions(search, page, size);
    }

    /** Assessment dropdown — paged, searchable by name. */
    @GetMapping("/getAssessments")
    public ReportPageResponse<ReportAssessmentOption> getAssessments(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return assessmentReportService.assessmentOptions(search, page, size);
    }

    /**
     * The respondent listing. Every filter optional: no organizationId = all
     * organizations, no assessmentId = all assessments, search matches
     * name/email (contains, case-insensitive).
     */
    @GetMapping("/getRespondents")
    public ReportPageResponse<ReportRespondentRow> getRespondents(
            @RequestParam(required = false) Long organizationId,
            @RequestParam(required = false) Long assessmentId,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return assessmentReportService.respondentRows(organizationId, assessmentId, search, page, size);
    }

    /**
     * The info popup behind a listing row: profile + every assessment allotted
     * to this respondent, each with how far the attempt got.
     */
    @GetMapping("/getRespondentDetail/{respondentUserId}")
    public ResponseEntity<?> getRespondentDetail(@PathVariable Long respondentUserId) {
        return assessmentReportService.respondentDetail(respondentUserId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Respondent " + respondentUserId + " not found")));
    }

    /**
     * Reset one allotment: the respondent's answers and demographic responses
     * for that assessment are deleted and the allotment drops back to
     * NOT_STARTED, so they take it again from scratch. Destructive and not
     * undoable — the dashboard confirms before calling.
     */
    @PostMapping("/resetAssessment/{respondentAssessmentMappingId}")
    public ResponseEntity<?> resetAssessment(@PathVariable Long respondentAssessmentMappingId) {
        return assessmentReportService.resetAssessment(respondentAssessmentMappingId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Assessment allotment "
                                + respondentAssessmentMappingId + " not found")));
    }
}
