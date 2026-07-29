package com.bodhpsychometric.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.ReportAssessmentOption;
import com.bodhpsychometric.dto.ReportOrganizationOption;
import com.bodhpsychometric.dto.ReportPageResponse;
import com.bodhpsychometric.dto.ReportRespondentAssessmentRow;
import com.bodhpsychometric.dto.ReportRespondentDetail;
import com.bodhpsychometric.dto.ReportRespondentRow;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.demographics.DemographicResponseRepository;
import com.bodhpsychometric.repository.organization.OrganizationRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;

/**
 * The reports area. Mostly read: the two filter dropdowns (organizations,
 * assessments — both searchable by name), the respondent rows themselves
 * (filtered by an optional organization, an optional assessment, and a
 * name/email search; null filter = "all"), and the per-respondent info
 * popup behind them. The one write is {@link #resetAssessment(Long)}, which
 * hands a respondent's assessment back to them from scratch.
 */
@Service
public class AssessmentReportService {

    /** Dropdowns and listings never return more than this per page. */
    private static final int MAX_PAGE_SIZE = 100;

    private final OrganizationRepository organizations;
    private final AssessmentRepository assessments;
    private final RespondentUserRepository respondents;
    private final RespondentAssessmentMappingRepository allotments;
    private final AssessmentAnswerRepository answers;
    private final DemographicResponseRepository demographicResponses;
    private final QuestionnaireQuestionRepository placements;

    public AssessmentReportService(OrganizationRepository organizations,
            AssessmentRepository assessments,
            RespondentUserRepository respondents,
            RespondentAssessmentMappingRepository allotments,
            AssessmentAnswerRepository answers,
            DemographicResponseRepository demographicResponses,
            QuestionnaireQuestionRepository placements) {
        this.organizations = organizations;
        this.assessments = assessments;
        this.respondents = respondents;
        this.allotments = allotments;
        this.answers = answers;
        this.demographicResponses = demographicResponses;
        this.placements = placements;
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

    /**
     * The info popup behind a listing row: the respondent's profile plus every
     * assessment allotted to them, each with how far the attempt got. Two
     * group-by queries cover the whole popup; question totals are counted per
     * distinct questionnaire (assessments commonly share one).
     * Empty when the respondent does not exist.
     */
    @Transactional(readOnly = true)
    public Optional<ReportRespondentDetail> respondentDetail(Long respondentUserId) {
        RespondentUser respondent = respondents.findById(respondentUserId).orElse(null);
        if (respondent == null) {
            return Optional.empty();
        }

        Map<Long, Long> answered = tallyByAssessment(answers.tallyAnswersByAssessment(respondentUserId));
        Map<Long, Long> demographics =
                tallyByAssessment(demographicResponses.tallyDemographicsByAssessment(respondentUserId));

        Map<Long, Long> questionsPerQuestionnaire = new HashMap<>();
        List<ReportRespondentAssessmentRow> rows = new ArrayList<>();
        for (RespondentAssessmentMapping mapping : allotments.findForReportDetail(respondentUserId)) {
            Long assessmentId = mapping.getAssessment().getAssessmentId();
            Long questionnaireId = mapping.getAssessment().getQuestionnaire().getQuestionnaireId();
            long totalQuestions = questionsPerQuestionnaire.computeIfAbsent(questionnaireId,
                    placements::countByQuestionnaireQuestionnaireId);
            rows.add(ReportRespondentAssessmentRow.from(mapping,
                    answered.getOrDefault(assessmentId, 0L),
                    totalQuestions,
                    demographics.getOrDefault(assessmentId, 0L)));
        }
        return Optional.of(ReportRespondentDetail.from(respondent, rows));
    }

    /**
     * Hand one assessment back to the respondent from scratch: the pair's
     * answer set and demographic set are deleted and the allotment drops to
     * NOT_STARTED / not-persisted, so the portal lets them begin again. The
     * allotment itself stays — this is a re-take, not an un-assign — and
     * COMPLETED is deliberately resettable, since a finished attempt is
     * exactly what a practitioner needs to clear. Nothing is archived: the
     * previous answers are gone. Idempotent on an untouched allotment.
     * Empty when the allotment does not exist.
     */
    @Transactional
    public Optional<ReportRespondentAssessmentRow> resetAssessment(Long respondentAssessmentMappingId) {
        RespondentAssessmentMapping mapping =
                allotments.findForReportReset(respondentAssessmentMappingId).orElse(null);
        if (mapping == null) {
            return Optional.empty();
        }
        Long respondentUserId = mapping.getRespondent().getId();
        Long assessmentId = mapping.getAssessment().getAssessmentId();

        answers.deleteByRespondent_IdAndAssessment_AssessmentId(respondentUserId, assessmentId);
        demographicResponses.deleteByRespondent_IdAndAssessment_AssessmentId(respondentUserId, assessmentId);
        // Push the deletes out now: the status flip below is what tells the
        // portal the attempt is takeable again, and it must not be reported
        // over rows that are still sitting in the persistence context.
        answers.flush();
        demographicResponses.flush();

        mapping.setAssessmentStatus(RespondentAssessmentStatus.NOT_STARTED);
        mapping.setPersisted(false);
        RespondentAssessmentMapping saved = allotments.save(mapping);

        long totalQuestions = placements.countByQuestionnaireQuestionnaireId(
                saved.getAssessment().getQuestionnaire().getQuestionnaireId());
        return Optional.of(ReportRespondentAssessmentRow.from(saved, 0L, totalQuestions, 0L));
    }

    /** assessmentId → count, off a group-by projection. */
    private static Map<Long, Long> tallyByAssessment(List<Object[]> projection) {
        Map<Long, Long> tallies = new HashMap<>();
        for (Object[] row : projection) {
            tallies.put((Long) row[0], ((Number) row[1]).longValue());
        }
        return tallies;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static Pageable pageOf(int page, int size, Sort sort) {
        return PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE), sort);
    }
}
