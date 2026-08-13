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
 * Both report export endpoints return this shape; the per-respondent one just
 * carries a single row. Only respondents whose allotment is COMPLETED appear.
 */
public record ExportSheetResponse(
        ExportAssessmentRef assessment,
        /** Echoes the organization filter that produced these rows; null = all organizations. */
        Long organizationId,
        List<DemographicColumn> demographicColumns,
        List<QuestionColumn> questionColumns,
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
            Map<String, String> answers) {
    }
}
