package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.taxonomy.MeasuredQuality;

/**
 * What the API returns for a Measured Quality, including its full MQT tree
 * (roots are the types with no parent; children nest inside each node).
 * A DTO on purpose: the entity's types collection is lazy and cannot be
 * serialized after the session closes — callers of from() must be inside a
 * transaction when the entity was loaded from the database.
 */
public record MeasuredQualityResponse(Long measuredQualityId, String name, String description,
        List<MqtNodeResponse> mqts) {

    public static MeasuredQualityResponse from(MeasuredQuality mq) {
        List<MqtNodeResponse> roots = mq.getTypes().stream()
                .filter(t -> t.getParent() == null)
                .map(MqtNodeResponse::from)
                .toList();
        return new MeasuredQualityResponse(mq.getMeasuredQualityId(), mq.getName(), mq.getDescription(), roots);
    }
}
