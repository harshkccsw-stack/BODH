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
        /**
         * Optional help text under this option's label, shown to the
         * respondent. Omitted, null and blank are the same thing — no
         * description — so a caller written before this field existed keeps
         * meaning exactly what it meant.
         */
        String description,
        ContentType contentType,
        String mediaUrl,
        List<MqtScoreRequest> mqtScores) {
}
