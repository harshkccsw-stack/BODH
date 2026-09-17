package com.bodhpsychometric.dto;

import java.math.BigDecimal;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.auth.enums.Vertical;
import com.bodhpsychometric.model.questionnaire.Questionnaire;

/**
 * One card on the public Products listing.
 *
 * Deliberately NOT AssessmentResponse: that DTO carries respondentCount, an
 * internal usage figure that must never reach the marketing site. Everything
 * descriptive here comes from the linked questionnaire — the assessment itself
 * holds only a name and a price.
 */
public record PublicProductSummary(
        Long assessmentId,
        String name,
        BigDecimal price,
        String currency,
        String category,
        Vertical vertical,
        String description,
        Integer durationMinutes,
        int questionCount) {

    public static PublicProductSummary from(Assessment a, int questionCount) {
        Questionnaire q = a.getQuestionnaire();
        return new PublicProductSummary(
                a.getAssessmentId(),
                a.getName(),
                a.getPrice(),
                a.getCurrency(),
                q.getCategory(),
                q.getVertical(),
                q.getDescription(),
                q.getDurationMinutes(),
                questionCount);
    }
}
