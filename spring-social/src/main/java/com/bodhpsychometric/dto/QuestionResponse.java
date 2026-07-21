package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.enums.ContentType;

/**
 * A question with its options and MQT scores, plus which questionnaire it is
 * attached to (null when unattached). Walks lazy state — build inside a
 * transaction; the score lists come from the controller, which owns the
 * scoring rows.
 */
public record QuestionResponse(
        Long questionId,
        Long questionnaireId,
        String questionnaireName,
        Long sectionId,
        Integer sortOrder,
        ContentType contentType,
        String stem,
        String mediaUrl,
        boolean riskFlag,
        List<QuestionOptionResponse> options,
        List<MqtScoreResponse> mqtScores) {

    public static QuestionResponse from(Question q, List<QuestionOptionResponse> options,
            List<MqtScoreResponse> mqtScores) {
        return new QuestionResponse(
                q.getQuestionId(),
                q.getQuestionnaire() == null ? null : q.getQuestionnaire().getQuestionnaireId(),
                q.getQuestionnaire() == null ? null : q.getQuestionnaire().getName(),
                q.getSection() == null ? null : q.getSection().getSectionId(),
                q.getSortOrder(),
                q.getContentType(),
                q.getQuestionTexString(),
                q.getMediaUrl(),
                q.isRiskFlag(),
                options,
                mqtScores);
    }
}
