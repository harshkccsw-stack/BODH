package com.bodhpsychometric.dto;

/** One MQT scoring entry as the API returns it — name included for display. */
public record MqtScoreResponse(
        Long measuredQualityTypeId,
        String measuredQualityTypeName,
        int score) {
}
