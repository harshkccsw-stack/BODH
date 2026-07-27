package com.bodhpsychometric.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.ReportAssessmentOption;
import com.bodhpsychometric.dto.ReportOrganizationOption;
import com.bodhpsychometric.dto.ReportPageResponse;
import com.bodhpsychometric.dto.ReportRespondentRow;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.organization.OrganizationRepository;

/**
 * Read side of the reports area. Everything is a paged listing: the two
 * filter dropdowns (organizations, assessments — both searchable by name)
 * and the respondent rows themselves, filtered by an optional organization,
 * an optional assessment (only respondents allotted it), and a
 * name/email search. Null filter = "all". Listing only for now — exports
 * will sit on top of the same queries later.
 */
@Service
public class AssessmentReportService {

    /** Dropdowns and listings never return more than this per page. */
    private static final int MAX_PAGE_SIZE = 100;

    private final OrganizationRepository organizations;
    private final AssessmentRepository assessments;
    private final RespondentUserRepository respondents;
    private final RespondentAssessmentMappingRepository allotments;

    public AssessmentReportService(OrganizationRepository organizations,
            AssessmentRepository assessments,
            RespondentUserRepository respondents,
            RespondentAssessmentMappingRepository allotments) {
        this.organizations = organizations;
        this.assessments = assessments;
        this.respondents = respondents;
        this.allotments = allotments;
    }

    @Transactional(readOnly = true)
    public ReportPageResponse<ReportOrganizationOption> organizationOptions(String search, int page, int size) {
        Pageable pageable = pageOf(page, size, Sort.by("name").ascending());
        Page<Organization> result = isBlank(search)
                ? organizations.findAll(pageable)
                : organizations.findByNameContainingIgnoreCase(search.trim(), pageable);
        return ReportPageResponse.from(result.map(ReportOrganizationOption::from));
    }

    @Transactional(readOnly = true)
    public ReportPageResponse<ReportAssessmentOption> assessmentOptions(String search, int page, int size) {
        Pageable pageable = pageOf(page, size, Sort.by("name").ascending());
        Page<Assessment> result = isBlank(search)
                ? assessments.findAll(pageable)
                : assessments.findByNameContainingIgnoreCase(search.trim(), pageable);
        return ReportPageResponse.from(result.map(ReportAssessmentOption::from));
    }

    @Transactional(readOnly = true)
    public ReportPageResponse<ReportRespondentRow> respondentRows(Long organizationId, Long assessmentId,
            String search, int page, int size) {
        String pattern = isBlank(search) ? null : "%" + search.trim().toLowerCase() + "%";
        // Ordering lives inside the query (name, id) — the page stays unsorted.
        Page<RespondentUser> result = respondents.findForReport(organizationId, assessmentId,
                pattern, pageOf(page, size, Sort.unsorted()));

        // One group-by for the whole page: respondentUserId → [assigned,
        // completed], scoped to the assessment filter so the tallies match
        // what's listed.
        List<Long> ids = result.getContent().stream().map(RespondentUser::getId).toList();
        Map<Long, long[]> tallies = new HashMap<>();
        if (!ids.isEmpty()) {
            for (Object[] row : allotments.tallyAssignmentsForReport(ids, assessmentId)) {
                tallies.put((Long) row[0], new long[] {
                        ((Number) row[1]).longValue(),
                        row[2] == null ? 0L : ((Number) row[2]).longValue()});
            }
        }
        return ReportPageResponse.from(result.map(r -> {
            long[] tally = tallies.getOrDefault(r.getId(), new long[] {0L, 0L});
            return ReportRespondentRow.from(r, tally[0], tally[1]);
        }));
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static Pageable pageOf(int page, int size, Sort sort) {
        return PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE), sort);
    }
}
