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

import com.bodhpsychometric.dto.LiveTrackingResponse;
import com.bodhpsychometric.dto.PendingSubmissionResponse;
import com.bodhpsychometric.dto.ReportAssessmentOption;
import com.bodhpsychometric.dto.ReportOrganizationOption;
import com.bodhpsychometric.dto.ReportPageResponse;
import com.bodhpsychometric.dto.ReportRespondentRow;
import com.bodhpsychometric.service.AssessmentReportService;
import com.bodhpsychometric.service.SubmissionDigestService;

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

    @Autowired
    private SubmissionDigestService submissionDigestService;

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
     * Export sheet for one assessment — one row per COMPLETED respondent, with
     * demographic and question-tag columns, for the dashboard to render as
     * XLSX. Optional organizationId scopes the rows to that org's members;
     * omit it for every organization. 404 only when the assessment does not
     * exist (an assessment with no completed attempts returns empty rows).
     */
    @GetMapping("/export/assessment/{assessmentId}")
    public ResponseEntity<?> exportAssessment(@PathVariable Long assessmentId,
            @RequestParam(required = false) Long organizationId) {
        return assessmentReportService.exportAssessment(assessmentId, organizationId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Assessment " + assessmentId + " not found")));
    }

    /**
     * Export sheet for a single respondent on one assessment — same shape, one
     * row. Optional organizationId narrows to that org. 404 when the assessment
     * is missing or the respondent has no COMPLETED attempt for it.
     */
    @GetMapping("/export/assessment/{assessmentId}/respondent/{respondentUserId}")
    public ResponseEntity<?> exportRespondent(@PathVariable Long assessmentId,
            @PathVariable Long respondentUserId,
            @RequestParam(required = false) Long organizationId) {
        return assessmentReportService.exportRespondent(assessmentId, respondentUserId, organizationId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "No completed attempt for respondent " + respondentUserId
                                + " on assessment " + assessmentId)));
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

    /**
     * The Live Tracking page's poll: whole-filter state totals plus one
     * most-alive-first page. Both filters optional — omitted means all
     * organizations / any assessment. Excluded from the activity trail
     * (machine polling, see ActivityLogFilter); MySQL cost is bounded by the
     * service's short base-list cache regardless of poll rate.
     */
    @GetMapping("/liveTracking")
    public LiveTrackingResponse getLiveTracking(
            @RequestParam(required = false) Long organizationId,
            @RequestParam(required = false) Long assessmentId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return assessmentReportService.liveTracking(organizationId, assessmentId, page, size);
    }

    /**
     * Redis-staged submissions the digest has not landed in MySQL yet —
     * queued (still retrying) and failed (all attempts spent, waiting for a
     * requeue) alike. Empty when everything is digested or Redis is away.
     */
    @GetMapping("/pendingSubmissions")
    public java.util.List<PendingSubmissionResponse> getPendingSubmissions() {
        return submissionDigestService.pendingSubmissions();
    }

    /**
     * Puts a held (or stuck) staged submission back under the digest with
     * fresh attempts and fires one immediately. 404 when nothing is staged
     * for that allotment — already digested, expired, or never existed.
     */
    @PostMapping("/requeueSubmission/{respondentAssessmentMappingId}")
    public ResponseEntity<?> requeueSubmission(@PathVariable Long respondentAssessmentMappingId) {
        return submissionDigestService.requeue(respondentAssessmentMappingId)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "No staged submission for allotment "
                                + respondentAssessmentMappingId)));
    }
}
