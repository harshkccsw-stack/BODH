package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.enums.ContentType;

/**
 * A bank question with its options and MQT scores. usedIn lists every
 * questionnaire the question appears in (empty = unattached). sectionId and
 * sortOrder are placement context — filled only when the question is read
 * through one questionnaire (getByQuestionnaireId), null in bank-wide reads
 * because a question placed in several questionnaires has several placements.
 */
public record QuestionResponse(
        Long questionId,
        List<UsedInRef> usedIn,
        Long sectionId,
        Integer sortOrder,
        ContentType contentType,
        String stem,
        String mediaUrl,
        boolean riskFlag,
        List<QuestionOptionResponse> options,
        List<MqtScoreResponse> mqtScores) {

    /** One questionnaire that uses this question. */
    public record UsedInRef(Long questionnaireId, String name) {
    }

    public static QuestionResponse from(Question q, List<UsedInRef> usedIn, Long sectionId, Integer sortOrder,
            List<QuestionOptionResponse> options, List<MqtScoreResponse> mqtScores) {
        return new QuestionResponse(
                q.getQuestionId(),
                usedIn,
                sectionId,
                sortOrder,
                q.getContentType(),
                q.getQuestionTexString(),
                q.getMediaUrl(),
                q.isRiskFlag(),
                options,
                mqtScores);
    }
}
