package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.enums.ContentType;

/**
 * One option inside a question payload. Display order is list order — the
 * backend assigns sortOrder from the index. contentType defaults to TEXT
 * when omitted; mediaUrl is only meaningful for non-TEXT options. mqtScores
 * is what choosing this option contributes per MQT.
 */
public record QuestionOptionRequest(
        String optionText,
        ContentType contentType,
        String mediaUrl,
        List<MqtScoreRequest> mqtScores) {
}
