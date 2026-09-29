package com.bodhpsychometric.dto;

import java.util.List;

/**
 * One row of a LIKERT_GRID question: the item's text, and what answering it
 * scores on each MQT. Rows are the full desired state, like options — the
 * backend replaces what is stored to match, and list order becomes sortOrder.
 *
 * mqtScores has the SAME shape as an option's (2026-09-29): the row carries
 * the number, earned when the row is answered whatever column is picked —
 * the column is the answer, not the score. A score of 0 is a pure
 * nomination, which still filters any scores the columns carry. Rows with
 * neither text nor a mapping are dropped, so a form with trailing blank row
 * inputs behaves like the option editor.
 */
public record QuestionRowRequest(
        String rowText,
        List<MqtScoreRequest> mqtScores) {
}
