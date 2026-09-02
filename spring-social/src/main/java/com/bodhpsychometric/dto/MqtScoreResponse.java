package com.bodhpsychometric.dto;

/** One MQT scoring entry as the API returns it — name included for display. Decimal since V25. */
public record MqtScoreResponse(
        Long measuredQualityTypeId,
        String measuredQualityTypeName,
        double score) {
}
