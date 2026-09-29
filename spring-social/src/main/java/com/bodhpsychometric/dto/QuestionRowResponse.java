package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.QuestionRow;

/**
 * One grid row with what answering it scores, per MQT — the same
 * {@link MqtScoreResponse} shape an option's scores use. Empty on every
 * question type but LIKERT_GRID. See {@link QuestionRowRequest}.
 */
public record QuestionRowResponse(
        Long questionRowId,
        String rowText,
        int sortOrder,
        List<MqtScoreResponse> mqts) {

    public static QuestionRowResponse from(QuestionRow row, List<MqtScoreResponse> mqts) {
        return new QuestionRowResponse(row.getQuestionRowId(), row.getRowText(), row.getSortOrder(), mqts);
    }
}
