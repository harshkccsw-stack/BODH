package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotNull;

/**
 * One MQT scoring entry inside a question/option payload.
 *
 * <p>{@code score} is decimal — an option may be worth 0.25, 0.5 or 2.75 as
 * readily as 3 — and stays a PRIMITIVE, so a payload that omits it still means
 * 0 exactly as it did when this was an int. Any number of decimals is
 * accepted and rounded to 2 by {@code QuestionController#dedupe}; the editor's
 * arrows step in quarters, but a typed 0.1 is a legitimate weight and is kept.
 */
public record MqtScoreRequest(
        @NotNull(message = "measuredQualityTypeId is required")
        Long measuredQualityTypeId,
        double score) {
}
