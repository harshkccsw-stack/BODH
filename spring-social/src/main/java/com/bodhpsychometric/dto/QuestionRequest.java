package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.enums.ContentType;

import jakarta.validation.constraints.NotBlank;

/**
 * Payload for creating/updating a bank question. Questions are standalone —
 * attaching them to a questionnaire is the questionnaire-authoring flow, not
 * this payload. Options and both score sets are the full desired state — the
 * backend replaces what is stored to match. The legacy IRT/risk fields are
 * deliberately not exposed.
 */
public record QuestionRequest(
        ContentType contentType,
        @NotBlank(message = "stem is required")
        String stem,
        String mediaUrl,
        Boolean riskFlag,
        List<QuestionOptionRequest> options,
        List<MqtScoreRequest> mqtScores) {
}
