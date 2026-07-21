package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;

/** One node of an MQ's type tree, children nested to any depth. */
public record MqtNodeResponse(Long measuredQualityTypeId, String name, List<MqtNodeResponse> children) {

    public static MqtNodeResponse from(MeasuredQualityType node) {
        return new MqtNodeResponse(
                node.getMeasuredQualityTypeId(),
                node.getName(),
                node.getChildren().stream().map(MqtNodeResponse::from).toList());
    }
}
