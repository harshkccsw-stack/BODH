package com.bodhpsychometric.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.ExportSheetResponse;
import com.bodhpsychometric.dto.ExportSheetResponse.DemographicColumn;
import com.bodhpsychometric.dto.ExportSheetResponse.ExportAssessmentRef;
import com.bodhpsychometric.dto.ExportSheetResponse.ExportRow;
import com.bodhpsychometric.dto.ExportSheetResponse.MqColumn;
import com.bodhpsychometric.dto.ExportSheetResponse.MqtColumn;
import com.bodhpsychometric.dto.ExportSheetResponse.QuestionColumn;
import com.bodhpsychometric.dto.ExportSheetResponse.ScoringKeyEntry;
import com.bodhpsychometric.dto.ReportAssessmentOption;
import com.bodhpsychometric.dto.ReportOrganizationOption;
import com.bodhpsychometric.dto.ReportPageResponse;
import com.bodhpsychometric.dto.ReportRespondentAssessmentRow;
import com.bodhpsychometric.dto.ReportRespondentDetail;
import com.bodhpsychometric.dto.ReportRespondentRow;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.AssessmentAnswer;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.demographics.DemographicResponse;
import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.QuestionRow;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.questionnaire.Questionnaire;
import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.demographics.DemographicResponseRepository;
import com.bodhpsychometric.repository.demographics.QuestionnaireDemographicFieldRepository;
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
    private final QuestionnaireDemographicFieldRepository demographicFields;
    private final MqtScoringService scoring;

    public AssessmentReportService(OrganizationRepository organizations,
            AssessmentRepository assessments,
            RespondentUserRepository respondents,
            RespondentAssessmentMappingRepository allotments,
            AssessmentAnswerRepository answers,
            DemographicResponseRepository demographicResponses,
            QuestionnaireQuestionRepository placements,
            QuestionnaireDemographicFieldRepository demographicFields,
            MqtScoringService scoring) {
        this.organizations = organizations;
        this.assessments = assessments;
        this.respondents = respondents;
        this.allotments = allotments;
        this.answers = answers;
        this.demographicResponses = demographicResponses;
        this.placements = placements;
        this.demographicFields = demographicFields;
        this.scoring = scoring;
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
     * Export sheet for one assessment: one row per COMPLETED respondent, with
     * demographic and question-tag columns. An organizationId scopes the rows
     * to that org's members; null = every organization. Empty (→ 404) only
     * when the assessment itself does not exist — an assessment with no
     * completed attempts returns a sheet with columns and zero rows.
     */
    @Transactional(readOnly = true)
    public Optional<ExportSheetResponse> exportAssessment(Long assessmentId, Long organizationId) {
        Assessment assessment = assessments.findById(assessmentId).orElse(null);
        if (assessment == null) {
            return Optional.empty();
        }
        return Optional.of(buildSheet(assessment, organizationId,
                allotments.findCompletedForExport(assessmentId, organizationId, null)));
    }

    /**
     * Export sheet for a single respondent on one assessment — same shape, one
     * row. Empty (→ 404) when the assessment does not exist, or the respondent
     * has no COMPLETED attempt for it (optionally within the given org).
     */
    @Transactional(readOnly = true)
    public Optional<ExportSheetResponse> exportRespondent(Long assessmentId, Long respondentUserId,
            Long organizationId) {
        Assessment assessment = assessments.findById(assessmentId).orElse(null);
        if (assessment == null) {
            return Optional.empty();
        }
        List<RespondentAssessmentMapping> completed =
                allotments.findCompletedForExport(assessmentId, organizationId, respondentUserId);
        if (completed.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(buildSheet(assessment, organizationId, completed));
    }

    /**
     * What one export cell is keyed by: a question, or one ROW of a grid
     * question. questionRowId is null for every type but LIKERT_GRID.
     */
    private record ExportKey(Long questionId, Long questionRowId) {
    }

    /**
     * Assemble the sheet: columns come from the assessment's questionnaire (its
     * demographic fields in form order, its question placements in display
     * order keyed by questionTag, and the MQ / MQT traits it measures); each
     * COMPLETED allotment becomes a row whose cells are looked up by fieldId /
     * questionTag and whose scores are looked up by mqtId / mqId. Multi-select
     * questions join their chosen options with "; " in option order.
     *
     * The scoring plan is read ONCE here and applied per row — see
     * {@link MqtScoringService} for what the numbers mean.
     */
    private ExportSheetResponse buildSheet(Assessment assessment, Long organizationId,
            List<RespondentAssessmentMapping> completed) {
        Long assessmentId = assessment.getAssessmentId();
        Questionnaire questionnaire = assessment.getQuestionnaire();
        Long questionnaireId = questionnaire.getQuestionnaireId();

        // ── Columns ──────────────────────────────────────────────────────
        List<DemographicColumn> demographicColumns = demographicFields
                .findForPortalDelivery(questionnaireId).stream()
                .map(QuestionnaireDemographicField::getDemographicField)
                .map(f -> new DemographicColumn(f.getDemographicFieldId(), f.getLabel()))
                .toList();

        // (questionId, rowId) → column tag, so an answer finds its column.
        // Legacy placements with no tag fall back to "Q_<id>".
        //
        // A grid contributes one column PER ROW, tagged <tag>_R<n> in row
        // order — twenty statements rated on one grid are twenty variables,
        // and one joined cell would be useless to analyse. The suffix is
        // derived here rather than stored: rows belong to the question, the
        // tag belongs to the placement, and the tag itself is already
        // regenerated wholesale on every placement save.
        Map<ExportKey, String> tagByKey = new HashMap<>();
        List<QuestionColumn> questionColumns = new ArrayList<>();
        for (QuestionnaireQuestion qq : placements.findForExportColumns(questionnaireId)) {
            Question question = qq.getQuestion();
            Long questionId = question.getQuestionId();
            String tag = qq.getQuestionTag() != null ? qq.getQuestionTag() : ("Q_" + questionId);
            String stem = question.getQuestionTexString();
            List<QuestionRow> gridRows = question.getQuestionType() == QuestionType.LIKERT_GRID
                    ? question.getRows().stream().sorted(Comparator.comparingInt(QuestionRow::getSortOrder)).toList()
                    : List.of();
            if (gridRows.isEmpty()) {
                tagByKey.put(new ExportKey(questionId, null), tag);
                questionColumns.add(new QuestionColumn(tag, questionId, stem, null, null));
                continue;
            }
            for (int i = 0; i < gridRows.size(); i++) {
                QuestionRow row = gridRows.get(i);
                String rowTag = tag + "_R" + (i + 1);
                tagByKey.put(new ExportKey(questionId, row.getQuestionRowId()), rowTag);
                questionColumns.add(new QuestionColumn(rowTag, questionId, stem,
                        row.getQuestionRowId(), row.getRowText()));
            }
        }

        // ── Scoring columns (one plan for the whole sheet) ────────────────
        MqtScoringService.ScoringPlan plan = scoring.planFor(questionnaireId);
        List<MqColumn> mqColumns = plan.mqs().stream()
                .map(mq -> new MqColumn(mq.measuredQualityId(), mq.name()))
                .toList();
        List<MqtColumn> mqtColumns = plan.mqts().stream()
                .map(mqt -> new MqtColumn(mqt.measuredQualityTypeId(), mqt.measuredQualityId(),
                        mqt.mqName(), mqt.name(), mqt.path(), mqt.depth(),
                        mqt.parentTypeId(), mqt.hasChildren()))
                .toList();
        List<ScoringKeyEntry> scoringKey = buildScoringKey(questionnaireId, plan, tagByKey);

        // ── Row data (two group-bys over the whole page) ──────────────────
        List<Long> respondentIds = completed.stream().map(m -> m.getRespondent().getId()).toList();

        // respondentId → (questionId, rowId) → chosen cell strings (already option-ordered)
        Map<Long, Map<ExportKey, List<String>>> answersByRespondent = new HashMap<>();
        // respondentId → the answers themselves, which is what scoring consumes
        // (a cell is text, a score needs the option and grid row behind it).
        Map<Long, List<AssessmentAnswer>> rawAnswersByRespondent = new HashMap<>();
        // respondentId → fieldId → value
        Map<Long, Map<Long, String>> demographicsByRespondent = new HashMap<>();
        if (!respondentIds.isEmpty()) {
            for (AssessmentAnswer a : answers.findForExport(assessmentId, respondentIds)) {
                rawAnswersByRespondent
                        .computeIfAbsent(a.getRespondent().getId(), k -> new ArrayList<>())
                        .add(a);
                Option option = a.getOption();
                String cell = option != null ? option.getOptionText() : a.getAnswerText();
                if (cell == null) {
                    continue;
                }
                answersByRespondent
                        .computeIfAbsent(a.getRespondent().getId(), k -> new HashMap<>())
                        .computeIfAbsent(new ExportKey(a.getQuestion().getQuestionId(),
                                a.getQuestionRow() == null ? null : a.getQuestionRow().getQuestionRowId()),
                                k -> new ArrayList<>())
                        .add(cell);
            }
            for (DemographicResponse d : demographicResponses.findForExport(assessmentId, respondentIds)) {
                demographicsByRespondent
                        .computeIfAbsent(d.getRespondent().getId(), k -> new HashMap<>())
                        .put(d.getDemographicField().getDemographicFieldId(), d.getResponseValue());
            }
        }

        // ── Rows ──────────────────────────────────────────────────────────
        List<ExportRow> rows = new ArrayList<>();
        for (RespondentAssessmentMapping mapping : completed) {
            RespondentUser respondent = mapping.getRespondent();
            Long respondentUserId = respondent.getId();
            Organization organization = respondent.getOrganization();

            Map<String, String> answerCells = new HashMap<>();
            for (Map.Entry<ExportKey, List<String>> entry
                    : answersByRespondent.getOrDefault(respondentUserId, Map.of()).entrySet()) {
                String tag = tagByKey.get(entry.getKey());
                if (tag == null) {
                    // The answer's question is no longer placed in this
                    // questionnaire — or its grid row is gone — so there is
                    // no column to put it in.
                    continue;
                }
                answerCells.put(tag, String.join("; ", entry.getValue()));
            }

            MqtScoringService.Scores scores = scoring.score(
                    rawAnswersByRespondent.getOrDefault(respondentUserId, List.of()), plan);

            rows.add(new ExportRow(
                    respondentUserId,
                    respondent.getUser().getSerialId(),
                    respondent.getName(),
                    respondent.getUser().getEmail(),
                    organization == null ? null : organization.getOrganizationId(),
                    organization == null ? null : organization.getName(),
                    mapping.getAssessmentStatus(),
                    mapping.getPopUpCount(),
                    demographicsByRespondent.getOrDefault(respondentUserId, Map.of()),
                    answerCells,
                    scores.mqtScores(),
                    scores.mqtTotals(),
                    scores.mqScores()));
        }

        return new ExportSheetResponse(
                new ExportAssessmentRef(assessmentId, assessment.getName(),
                        questionnaireId, questionnaire.getName()),
                organizationId, demographicColumns, questionColumns,
                mqColumns, mqtColumns, scoringKey, rows);
    }

    /**
     * Spell out every scoring edge the sheet's numbers come from, in column
     * order: the question-level flat scores first (they land once the question
     * is answered, whatever was picked), then what each option is worth.
     *
     * A grid is listed per ROW and already filtered by that row's nomination,
     * so the entries under a row tag are exactly what can be earned there —
     * the same filter {@link MqtScoringService} applies when scoring.
     *
     * Options come off the portal-delivery fetch, which loads them in one
     * query; the grid rows it leaves lazy are already in the persistence
     * context from building the columns above.
     */
    private List<ScoringKeyEntry> buildScoringKey(Long questionnaireId,
            MqtScoringService.ScoringPlan plan, Map<ExportKey, String> tagByKey) {
        if (plan.mqts().isEmpty()) {
            return List.of();
        }
        Map<Long, String> pathByMqt = new HashMap<>();
        plan.mqts().forEach(mqt -> pathByMqt.put(mqt.measuredQualityTypeId(), mqt.path()));

        List<ScoringKeyEntry> entries = new ArrayList<>();
        for (QuestionnaireQuestion qq : placements.findForPortalDelivery(questionnaireId)) {
            Question question = qq.getQuestion();
            Long questionId = question.getQuestionId();
            String tag = qq.getQuestionTag() != null ? qq.getQuestionTag() : ("Q_" + questionId);
            String stem = question.getQuestionTexString();

            plan.questionScores().getOrDefault(questionId, Map.of()).forEach((mqtId, score) -> {
                if (pathByMqt.containsKey(mqtId)) {
                    entries.add(new ScoringKeyEntry(tag, stem, null, null, mqtId, pathByMqt.get(mqtId), score));
                }
            });

            List<Option> options = question.getOptions().stream()
                    .sorted(Comparator.comparingInt(Option::getSortOrder)).toList();
            List<QuestionRow> gridRows = question.getQuestionType() == QuestionType.LIKERT_GRID
                    ? question.getRows().stream().sorted(Comparator.comparingInt(QuestionRow::getSortOrder)).toList()
                    : List.of();

            if (gridRows.isEmpty()) {
                for (Option option : options) {
                    addOptionEntries(entries, tag, stem, null, option, null, plan, pathByMqt);
                }
                continue;
            }
            for (int i = 0; i < gridRows.size(); i++) {
                QuestionRow row = gridRows.get(i);
                String rowTag = tagByKey.getOrDefault(new ExportKey(questionId, row.getQuestionRowId()),
                        tag + "_R" + (i + 1));
                Set<Long> nominated = plan.rowNominations().getOrDefault(row.getQuestionRowId(), Set.of());
                for (Option option : options) {
                    addOptionEntries(entries, rowTag, stem, row.getRowText(), option, nominated, plan, pathByMqt);
                }
            }
        }
        return entries;
    }

    /** One option's edges; {@code nominated} null = no grid filter applies. */
    private static void addOptionEntries(List<ScoringKeyEntry> entries, String tag, String stem,
            String rowText, Option option, Set<Long> nominated,
            MqtScoringService.ScoringPlan plan, Map<Long, String> pathByMqt) {
        for (Map.Entry<Long, Integer> score
                : plan.optionScores().getOrDefault(option.getOptionId(), Map.of()).entrySet()) {
            Long mqtId = score.getKey();
            if ((nominated != null && !nominated.contains(mqtId)) || !pathByMqt.containsKey(mqtId)) {
                continue;
            }
            entries.add(new ScoringKeyEntry(tag, stem, rowText, option.getOptionText(),
                    mqtId, pathByMqt.get(mqtId), score.getValue()));
        }
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
        mapping.setPopUpCount(0);
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
