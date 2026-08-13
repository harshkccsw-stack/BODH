package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.QuestionRow;

/**
 * One grid row with the MQTs it measures. Empty on every question type but
 * LIKERT_GRID. No scores here by design — see {@link QuestionRowRequest}.
 */
public record QuestionRowResponse(
        Long questionRowId,
        String rowText,
        int sortOrder,
        List<MqtRefResponse> mqts) {

    public static QuestionRowResponse from(QuestionRow row, List<MqtRefResponse> mqts) {
        return new QuestionRowResponse(row.getQuestionRowId(), row.getRowText(), row.getSortOrder(), mqts);
    }
}
