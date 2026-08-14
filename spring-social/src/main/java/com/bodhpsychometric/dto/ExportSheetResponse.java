package com.bodhpsychometric.dto;

import java.util.List;
import java.util.Map;

import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;

/**
 * A flat export "sheet" for one assessment: the column definitions plus one
 * row per COMPLETED respondent, ready for the dashboard to turn into XLSX.
 *
 * Columns are the same for every row and come from the assessment's
 * questionnaire — its demographic fields (in form order) and its question
 * placements (in display order, keyed by {@code questionTag}). Each row's
 * {@code demographics} map is keyed by demographicFieldId and {@code answers}
 * by questionTag, so the frontend renders a cell by walking the column lists
 * and looking each key up (a missing key = blank cell).
 *
 * The MQ / MQT scoring columns work the same way: {@code mqColumns} and
 * {@code mqtColumns} describe the traits this questionnaire measures, and each
 * row carries three keyed maps — the MQT's own score, its subtree total and
 * the MQ total (see {@link com.bodhpsychometric.service.MqtScoringService} for
 * the rule that produces them).
 *
 * Both report export endpoints return this shape; the per-respondent one just
 * carries a single row. Only respondents whose allotment is COMPLETED appear.
 */
public record ExportSheetResponse(
        ExportAssessmentRef assessment,
        /** Echoes the organization filter that produced these rows; null = all organizations. */
        Long organizationId,
        List<DemographicColumn> demographicColumns,
        List<QuestionColumn> questionColumns,
        /** MQs this questionnaire measures, by name. Empty when nothing is scored. */
        List<MqColumn> mqColumns,
        /** MQTs this questionnaire measures, MQ by MQ, depth-first in tree order. */
        List<MqtColumn> mqtColumns,
        /** Every scoring edge behind those numbers, so a total can be audited. */
        List<ScoringKeyEntry> scoringKey,
        List<ExportRow> rows) {

    public record ExportAssessmentRef(
            Long assessmentId,
            String name,
            Long questionnaireId,
            String questionnaireName) {
    }

    /** One demographic column header; cells are looked up by demographicFieldId. */
    public record DemographicColumn(Long demographicFieldId, String label) {
    }

    /**
     * One question column header; {@code questionTag} is the header text and
     * the key cells are looked up by.
     *
     * A LIKERT_GRID contributes ONE COLUMN PER ROW, not one per question —
     * twenty statements rated on one grid are twenty variables, and collapsing
     * them into a single "Never; Often; Always…" cell would make the sheet
     * useless. Those columns tag {@code <questionTag>_R<n>} by row order and
     * carry {@code questionRowId} + {@code rowText}; both are null on every
     * other type, where the question itself is the whole column.
     */
    public record QuestionColumn(String questionTag, Long questionId, String stem,
            Long questionRowId, String rowText) {
    }

    /** One MQ column; row totals are looked up by measuredQualityId. */
    public record MqColumn(Long measuredQualityId, String name) {
    }

    /**
     * One MQT column. {@code path} ("Cognition › Verbal › Vocabulary") is the
     * header text: MQT names are deliberately NOT unique, so two bare names
     * from different branches would render as the same column.
     *
     * {@code hasChildren} tells the sheet whether the subtree total is worth a
     * column of its own — on a leaf it always equals the node's own score.
     */
    public record MqtColumn(Long measuredQualityTypeId, Long measuredQualityId, String mqName,
            String name, String path, int depth, Long parentTypeId, boolean hasChildren) {
    }

    /**
     * One scoring edge, spelled out: "on column Q_3_R2, picking 'Always'
     * scores 5 on Cognition › Verbal". Enough to audit any total in the sheet
     * back to the editor that set it.
     *
     * {@code optionText} is null for a question-level flat score (the one that
     * lands once the question is answered at all, whatever was picked), and
     * {@code rowText} is null outside a grid. A grid's edges are already
     * filtered by the row's nomination, so what is listed is what can be
     * earned on that row.
     */
    public record ScoringKeyEntry(
            String questionTag,
            String stem,
            String rowText,
            String optionText,
            Long measuredQualityTypeId,
            String mqtPath,
            int score) {
    }

    /** One respondent's row. demographics keyed by fieldId, answers keyed by questionTag. */
    public record ExportRow(
            Long respondentUserId,
            String serialId,
            String name,
            String email,
            Long organizationId,
            String organizationName,
            RespondentAssessmentStatus status,
            /** Inactivity "focus" popups dismissed during the attempt. */
            int popUpCount,
            Map<Long, String> demographics,
            Map<String, String> answers,
            /** measuredQualityTypeId → that node's own score. */
            Map<Long, Integer> mqtScores,
            /** measuredQualityTypeId → own score + every descendant's. */
            Map<Long, Integer> mqtTotals,
            /** measuredQualityId → every node of that MQ. */
            Map<Long, Integer> mqScores) {
    }
}
