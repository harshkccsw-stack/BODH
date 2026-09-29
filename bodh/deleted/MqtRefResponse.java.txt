package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;

/**
 * An MQT named without a score — what a grid row's nomination is. The
 * scored form is {@link MqtScoreResponse}; this is deliberately not that,
 * because a row carries no number.
 */
public record MqtRefResponse(Long measuredQualityTypeId, String measuredQualityTypeName) {

    public static MqtRefResponse from(MeasuredQualityType mqt) {
        return new MqtRefResponse(mqt.getMeasuredQualityTypeId(), mqt.getName());
    }
}
