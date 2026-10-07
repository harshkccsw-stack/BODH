package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.enums.ContentType;

/** One option of a question as the API returns it, with its MQT scores. */
public record QuestionOptionResponse(
        Long optionId,
        String optionText,
        /** Help text under the label; null when the author set none. */
        String description,
        ContentType contentType,
        String mediaUrl,
        int sortOrder,
        List<MqtScoreResponse> mqtScores) {

    public static QuestionOptionResponse from(Option o, List<MqtScoreResponse> mqtScores) {
        return new QuestionOptionResponse(
                o.getOptionId(),
                o.getOptionText(),
                o.getDescription(),
                o.getContentType(),
                o.getMediaUrl(),
                o.getSortOrder(),
                mqtScores);
    }
}
