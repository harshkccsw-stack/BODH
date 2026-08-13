package com.bodhpsychometric.dto;

import java.util.List;

/**
 * One row of a LIKERT_GRID question: the item's text, and the MQTs it
 * measures. Rows are the full desired state, like options — the backend
 * replaces what is stored to match, and list order becomes sortOrder.
 *
 * measuredQualityTypeIds is a NOMINATION, deliberately without scores: the
 * number a rating is worth comes from the column, which is scored exactly the
 * way an MCQ's options are. Rows with neither text nor MQTs are dropped, so a
 * form with trailing blank row inputs behaves like the option editor.
 */
public record QuestionRowRequest(
        String rowText,
        List<Long> measuredQualityTypeIds) {
}
