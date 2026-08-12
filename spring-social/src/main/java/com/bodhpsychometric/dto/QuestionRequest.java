package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.SelectionRule;

import jakarta.validation.constraints.NotBlank;

/**
 * Payload for creating/updating a bank question. Questions are standalone —
 * attaching them to a questionnaire is the questionnaire-authoring flow, not
 * this payload. Options and both score sets are the full desired state — the
 * backend replaces what is stored to match. The legacy IRT/risk fields are
 * deliberately not exposed.
 *
 * selectionRule + selectionCount say how many options the respondent may pick
 * (MIN/MAX/EQUALS n). Both omitted = single choice, so callers written before
 * they existed keep meaning exactly what they meant. They cannot be validated
 * by annotations — the count is checked against the option list — so
 * QuestionController does it by hand, in bulk pass 1 as well.
 */
public record QuestionRequest(
        ContentType contentType,
        @NotBlank(message = "stem is required")
        String stem,
        String mediaUrl,
        Boolean riskFlag,
        SelectionRule selectionRule,
        Integer selectionCount,
        List<QuestionOptionRequest> options,
        List<MqtScoreRequest> mqtScores) {
}
