package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.baseline.BaselineQuestion;

public record BaselineQuestionResponse(Long baselineQuestionId, String text, int sortOrder, boolean active) {

    public static BaselineQuestionResponse from(BaselineQuestion q) {
        return new BaselineQuestionResponse(q.getBaselineQuestionId(), q.getText(), q.getSortOrder(), q.isActive());
    }
}
