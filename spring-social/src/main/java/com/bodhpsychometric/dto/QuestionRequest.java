package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.question.enums.SelectionRule;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Payload for creating/updating a bank question. Questions are standalone —
 * attaching them to a questionnaire is the questionnaire-authoring flow, not
 * this payload. Options and both score sets are the full desired state — the
 * backend replaces what is stored to match. The legacy IRT/risk fields are
 * deliberately not exposed.
 *
 * questionType is the SHAPE — MCQ (default, and what a payload written before
 * this field existed means), LINEAR_SCALE, LIKERT_GRID or SHORT_ANSWER. On a
 * LINEAR_SCALE the options list is IGNORED: the backend generates the points
 * scaleFrom—scaleTo (both omitted = 1—5) and derives their MQT scores from
 * mqtScores. On a LIKERT_GRID the options ARE the shared columns — scored
 * exactly as an MCQ's options are — and rows carry the items, each naming the
 * MQTs it measures. rows is ignored on every other type. A SHORT_ANSWER takes
 * neither options nor rows; only its stem and its question-level scores.
 *
 * shuffleOptions randomises the order the options are DELIVERED in — MCQ only
 * (a scale's points and a grid's columns are ordinal, and both are refused).
 * Omitted or null means false, the authored order, which is what every payload
 * written before the field existed means.
 *
 * selectionRule + selectionCount say how many options the respondent may pick
 * (MIN/MAX/EQUALS n). Both omitted = single choice, so callers written before
 * they existed keep meaning exactly what they meant. They cannot be validated
 * by annotations — the count is checked against the option list — so
 * QuestionController does it by hand, in bulk pass 1 as well.
 */
public record QuestionRequest(
        ContentType contentType,
        QuestionType questionType,
        @NotBlank(message = "stem is required")
        String stem,
        String mediaUrl,
        Boolean riskFlag,
        SelectionRule selectionRule,
        Integer selectionCount,
        Integer scaleFrom,
        Integer scaleTo,
        Boolean shuffleOptions,
        @Size(max = 100, message = "scaleLowLabel is at most 100 characters")
        String scaleLowLabel,
        @Size(max = 100, message = "scaleHighLabel is at most 100 characters")
        String scaleHighLabel,
        List<QuestionOptionRequest> options,
        List<QuestionRowRequest> rows,
        List<MqtScoreRequest> mqtScores) {
}
