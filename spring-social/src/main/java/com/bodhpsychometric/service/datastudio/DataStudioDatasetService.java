package com.bodhpsychometric.service.datastudio;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.DsDatasetResponse;
import com.bodhpsychometric.dto.DsDatasetResponse.Column;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.AssessmentAnswer;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.demographics.DemographicField;
import com.bodhpsychometric.model.demographics.DemographicResponse;
import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;
import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.QuestionRow;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.questionnaire.Questionnaire;
import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.demographics.DemographicResponseRepository;
import com.bodhpsychometric.repository.demographics.QuestionnaireDemographicFieldRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;
import com.bodhpsychometric.service.MqtScoringService;

/**
 * The live read behind every sheet, chart and KPI: one assessment turned into
 * a flat, self-describing grid.
 *
 * <h2>What a row is</h2>
 * One row per ALLOTTED ATTEMPT — every {@code RespondentAssessmentMapping} of
 * the assessment, not only the finished ones. An analyst's first questions are
 * usually "how many finished" and "who hasn't started", and a dataset that
 * quietly dropped the unfinished rows would answer both wrong.
 *
 * <h2>Why unfinished attempts score blank, not zero</h2>
 * {@link MqtScoringService} returns 0 for a trait nobody scored on, and for a
 * COMPLETED attempt that 0 is real — the respondent answered and earned
 * nothing. For an attempt that never started it is not a measurement at all,
 * and letting it into a column would drag every average and z-score toward
 * zero by exactly the number of people who have not turned up yet. So score
 * columns are NULL outside COMPLETED, and the formula engine skips nulls when
 * it aggregates. {@code core:completed} (1/0) is there so completion rate can
 * still be measured as a number.
 *
 * <h2>Column keys</h2>
 * Every key carries its family as a prefix, which is what keeps them unique
 * across families (a demographic field and a trait may both be "Age"):
 * <ul>
 * <li>{@code core:*} — identity and attempt state</li>
 * <li>{@code demo:<fieldId>} — one per demographic field on the form</li>
 * <li>{@code ans:<questionTag>} — one per question, or per ROW of a grid
 *     question, matching the export sheet's tagging exactly</li>
 * <li>{@code mqt:<id>} — that trait's own score</li>
 * <li>{@code mqtt:<id>} — that trait plus its whole subtree (only emitted for
 *     a node that has children; on a leaf it would duplicate {@code mqt:})</li>
 * <li>{@code mq:<id>} — a measured quality's total across all its nodes</li>
 * </ul>
 *
 * <h2>Cost</h2>
 * Five reads for the columns and three for the rows, regardless of how many
 * respondents come back — the scoring plan is built once and applied per row,
 * the same shape {@code AssessmentReportService} uses for exports. Nothing
 * here is cached: a sheet is expected to show what the database says right
 * now, and this is the read that makes that true.
 */
@Service
public class DataStudioDatasetService {

    /** Prefixes, in one place, because the formula grammar depends on them. */
    public static final String CORE = "core:";
    public static final String DEMO = "demo:";
    public static final String ANSWER = "ans:";
    public static final String MQT = "mqt:";
    public static final String MQT_TOTAL = "mqtt:";
    public static final String MQ = "mq:";

    private final AssessmentRepository assessments;
    private final RespondentAssessmentMappingRepository allotments;
    private final AssessmentAnswerRepository answers;
    private final DemographicResponseRepository demographicResponses;
    private final QuestionnaireQuestionRepository placements;
    private final QuestionnaireDemographicFieldRepository demographicFields;
    private final MqtScoringService scoring;

    public DataStudioDatasetService(AssessmentRepository assessments,
            RespondentAssessmentMappingRepository allotments,
            AssessmentAnswerRepository answers,
            DemographicResponseRepository demographicResponses,
            QuestionnaireQuestionRepository placements,
            QuestionnaireDemographicFieldRepository demographicFields,
            MqtScoringService scoring) {
        this.assessments = assessments;
        this.allotments = allotments;
        this.answers = answers;
        this.demographicResponses = demographicResponses;
        this.placements = placements;
        this.demographicFields = demographicFields;
        this.scoring = scoring;
    }

    /** What one cell is keyed by: a question, or one ROW of a grid question. */
    private record AnswerKey(Long questionId, Long questionRowId) {
    }

    /**
     * Build the grid for one assessment. Empty when the assessment does not
     * exist — the caller turns that into a 404. An assessment nobody has been
     * allotted returns its columns and zero rows, which is a real answer and
     * not an error.
     */
    @Transactional(readOnly = true)
    public Optional<DsDatasetResponse> dataset(Long assessmentId, Long organizationId) {
        Assessment assessment = assessments.findById(assessmentId).orElse(null);
        if (assessment == null) {
            return Optional.empty();
        }
        Questionnaire questionnaire = assessment.getQuestionnaire();
        Long questionnaireId = questionnaire.getQuestionnaireId();

        List<Column> columns = new ArrayList<>(coreColumns());

        // ── Demographic columns, in form order ────────────────────────────
        List<DemographicField> fields = demographicFields.findForPortalDelivery(questionnaireId).stream()
                .map(QuestionnaireDemographicField::getDemographicField)
                .toList();
        for (DemographicField field : fields) {
            columns.add(new Column(DEMO + field.getDemographicFieldId(), field.getLabel(),
                    demographicType(field), "demographics", optionsOf(field)));
        }

        // ── Answer columns, in display order ──────────────────────────────
        // A LIKERT_GRID contributes one column per ROW, tagged <tag>_R<n> —
        // twenty statements rated on one grid are twenty variables, and one
        // joined cell would be useless to analyse. Same tagging as the export
        // sheet, deliberately: a formula written against an exported column
        // name has to mean the same thing here.
        Map<AnswerKey, String> tagByKey = new HashMap<>();
        for (QuestionnaireQuestion placement : placements.findForExportColumns(questionnaireId)) {
            Question question = placement.getQuestion();
            Long questionId = question.getQuestionId();
            String tag = placement.getQuestionTag() != null
                    ? placement.getQuestionTag()
                    : ("Q_" + questionId);
            List<QuestionRow> gridRows = question.getQuestionType() == QuestionType.LIKERT_GRID
                    ? question.getRows().stream()
                            .sorted(Comparator.comparingInt(QuestionRow::getSortOrder)).toList()
                    : List.of();
            if (gridRows.isEmpty()) {
                tagByKey.put(new AnswerKey(questionId, null), tag);
                columns.add(new Column(ANSWER + tag, tag, "string", "answers"));
                continue;
            }
            for (int i = 0; i < gridRows.size(); i++) {
                QuestionRow row = gridRows.get(i);
                String rowTag = tag + "_R" + (i + 1);
                tagByKey.put(new AnswerKey(questionId, row.getQuestionRowId()), rowTag);
                columns.add(new Column(ANSWER + rowTag, rowTag, "string", "answers"));
            }
        }

        // ── Score columns (one plan for the whole sheet) ──────────────────
        MqtScoringService.ScoringPlan plan = scoring.planFor(questionnaireId);
        for (MqtScoringService.MqtRef mqt : plan.mqts()) {
            columns.add(new Column(MQT + mqt.measuredQualityTypeId(), mqt.path(), "number", "scores"));
            if (mqt.hasChildren()) {
                // On a leaf the subtree total IS the own score, so a second
                // identical column would only be a trap to average twice.
                columns.add(new Column(MQT_TOTAL + mqt.measuredQualityTypeId(),
                        mqt.path() + " (subtree total)", "number", "scores"));
            }
        }
        for (MqtScoringService.MqRef mq : plan.mqs()) {
            columns.add(new Column(MQ + mq.measuredQualityId(), mq.name() + " (MQ total)",
                    "number", "scores"));
        }

        // ── Rows ─────────────────────────────────────────────────────────
        List<RespondentAssessmentMapping> attempts =
                allotments.findAllForDataStudio(assessmentId, organizationId);
        List<Long> respondentIds = attempts.stream().map(m -> m.getRespondent().getId()).toList();

        Map<Long, Map<AnswerKey, List<String>>> cellsByRespondent = new HashMap<>();
        Map<Long, List<AssessmentAnswer>> rawByRespondent = new HashMap<>();
        Map<Long, Map<Long, String>> demographicsByRespondent = new HashMap<>();
        if (!respondentIds.isEmpty()) {
            for (AssessmentAnswer answer : answers.findForExport(assessmentId, respondentIds)) {
                Long respondentId = answer.getRespondent().getId();
                rawByRespondent.computeIfAbsent(respondentId, k -> new ArrayList<>()).add(answer);
                Option option = answer.getOption();
                String cell = option != null ? option.getOptionText() : answer.getAnswerText();
                if (cell == null) {
                    continue;
                }
                cellsByRespondent
                        .computeIfAbsent(respondentId, k -> new HashMap<>())
                        .computeIfAbsent(new AnswerKey(answer.getQuestion().getQuestionId(),
                                answer.getQuestionRow() == null
                                        ? null
                                        : answer.getQuestionRow().getQuestionRowId()),
                                k -> new ArrayList<>())
                        .add(cell);
            }
            for (DemographicResponse response : demographicResponses.findForExport(assessmentId, respondentIds)) {
                demographicsByRespondent
                        .computeIfAbsent(response.getRespondent().getId(), k -> new HashMap<>())
                        .put(response.getDemographicField().getDemographicFieldId(),
                                response.getResponseValue());
            }
        }

        List<Map<String, Object>> rows = new ArrayList<>(attempts.size());
        for (RespondentAssessmentMapping attempt : attempts) {
            rows.add(buildRow(attempt, plan, fields, tagByKey,
                    cellsByRespondent.getOrDefault(attempt.getRespondent().getId(), Map.of()),
                    rawByRespondent.getOrDefault(attempt.getRespondent().getId(), List.of()),
                    demographicsByRespondent.getOrDefault(attempt.getRespondent().getId(), Map.of())));
        }

        return Optional.of(new DsDatasetResponse("assessment:" + assessmentId, columns, rows));
    }

    /**
     * The set of keys a formula on this dataset may reference. Callers use it
     * to reject a typo'd column at save time rather than letting it silently
     * evaluate to blank on every row forever.
     */
    @Transactional(readOnly = true)
    public Set<String> columnKeys(Long assessmentId, Long organizationId) {
        Set<String> keys = new LinkedHashSet<>();
        dataset(assessmentId, organizationId)
                .ifPresent(d -> d.columns().forEach(c -> keys.add(c.key())));
        return keys;
    }

    /* ------------------------------------------------------------------ */

    private List<Column> coreColumns() {
        return List.of(
                new Column(CORE + "serialId", "Serial ID", "string", "core"),
                new Column(CORE + "name", "Respondent", "string", "core"),
                new Column(CORE + "email", "Email", "string", "core"),
                new Column(CORE + "organizationName", "Organization", "string", "core"),
                new Column(CORE + "status", "Attempt status", "enum", "core",
                        List.of(RespondentAssessmentStatus.NOT_STARTED.name(),
                                RespondentAssessmentStatus.ONGOING.name(),
                                RespondentAssessmentStatus.COMPLETED.name())),
                // 1/0 rather than the enum, so completion rate is AVERAGE()
                // of a column instead of a formula nobody remembers writing.
                new Column(CORE + "completed", "Completed (1/0)", "number", "core"),
                new Column(CORE + "popUpCount", "Focus popups", "number", "core"),
                new Column(CORE + "respondentId", "Respondent id", "number", "core"),
                new Column(CORE + "organizationId", "Organization id", "number", "core"));
    }

    private Map<String, Object> buildRow(RespondentAssessmentMapping attempt,
            MqtScoringService.ScoringPlan plan,
            List<DemographicField> fields,
            Map<AnswerKey, String> tagByKey,
            Map<AnswerKey, List<String>> cells,
            List<AssessmentAnswer> rawAnswers,
            Map<Long, String> demographics) {

        RespondentUser respondent = attempt.getRespondent();
        Organization organization = respondent.getOrganization();
        boolean completed = attempt.getAssessmentStatus() == RespondentAssessmentStatus.COMPLETED;

        Map<String, Object> row = new LinkedHashMap<>();
        // The allotment id, not the respondent's: a row IS an attempt, and
        // this is what traces it back.
        row.put("rowId", attempt.getRespondentAssessmentMappingId());

        row.put(CORE + "serialId", respondent.getUser().getSerialId());
        row.put(CORE + "name", respondent.getName());
        row.put(CORE + "email", respondent.getUser().getEmail());
        row.put(CORE + "organizationName", organization == null ? null : organization.getName());
        row.put(CORE + "status", attempt.getAssessmentStatus().name());
        row.put(CORE + "completed", completed ? 1 : 0);
        row.put(CORE + "popUpCount", attempt.getPopUpCount());
        row.put(CORE + "respondentId", respondent.getId());
        row.put(CORE + "organizationId", organization == null ? null : organization.getOrganizationId());

        for (DemographicField field : fields) {
            row.put(DEMO + field.getDemographicFieldId(),
                    demographics.get(field.getDemographicFieldId()));
        }

        for (Map.Entry<AnswerKey, List<String>> entry : cells.entrySet()) {
            String tag = tagByKey.get(entry.getKey());
            if (tag == null) {
                // The question is no longer placed in this questionnaire (or
                // its grid row is gone), so there is no column to put it in.
                continue;
            }
            // Multi-select joins its chosen options, in option order.
            row.put(ANSWER + tag, String.join("; ", entry.getValue()));
        }

        // Blank, not zero, on an unfinished attempt — see the class note.
        MqtScoringService.Scores scores = completed ? scoring.score(rawAnswers, plan) : null;
        for (MqtScoringService.MqtRef mqt : plan.mqts()) {
            Long id = mqt.measuredQualityTypeId();
            row.put(MQT + id, scores == null ? null : scores.mqtScores().get(id));
            if (mqt.hasChildren()) {
                row.put(MQT_TOTAL + id, scores == null ? null : scores.mqtTotals().get(id));
            }
        }
        for (MqtScoringService.MqRef mq : plan.mqs()) {
            row.put(MQ + mq.measuredQualityId(),
                    scores == null ? null : scores.mqScores().get(mq.measuredQualityId()));
        }
        return row;
    }

    /**
     * A NUMBER field becomes a numeric column so {@code AVERAGE([demo:3])}
     * works on age without anyone casting anything; a DROPDOWN declares its
     * choices so the grid can render a filter. DATE stays text — the formula
     * grammar has no date type, and pretending otherwise would produce
     * silently wrong arithmetic rather than an error.
     */
    private String demographicType(DemographicField field) {
        DemographicFieldType type = field.getFieldType();
        if (type == DemographicFieldType.NUMBER) {
            return "number";
        }
        return type == DemographicFieldType.DROPDOWN ? "enum" : "string";
    }

    private List<String> optionsOf(DemographicField field) {
        if (field.getFieldType() != DemographicFieldType.DROPDOWN || field.getOptions() == null) {
            return null;
        }
        return List.copyOf(field.getOptions());
    }
}
