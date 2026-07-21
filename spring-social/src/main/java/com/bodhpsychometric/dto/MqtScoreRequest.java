package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotNull;

/** One MQT scoring entry inside a question/option payload. */
public record MqtScoreRequest(
        @NotNull(message = "measuredQualityTypeId is required")
        Long measuredQualityTypeId,
        int score) {
}
