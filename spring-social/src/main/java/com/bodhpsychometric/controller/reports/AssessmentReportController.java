package com.bodhpsychometric.controller.reports;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.ReportAssessmentOption;
import com.bodhpsychometric.dto.ReportOrganizationOption;
import com.bodhpsychometric.dto.ReportPageResponse;
import com.bodhpsychometric.dto.ReportRespondentRow;
import com.bodhpsychometric.service.AssessmentReportService;

/**
 * Reports area, read-only. Feeds the dashboard's Reports Hub: two paged
 * filter dropdowns (organizations, assessments) and the paged respondent
 * listing behind them. All rules live in {@link AssessmentReportService}.
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
}
