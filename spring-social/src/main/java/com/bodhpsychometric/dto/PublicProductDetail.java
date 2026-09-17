package com.bodhpsychometric.dto;

import java.math.BigDecimal;
import java.util.List;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.auth.enums.Vertical;
import com.bodhpsychometric.model.questionnaire.Questionnaire;

/**
 * The public Products detail page. Same rule as PublicProductSummary — no
 * respondent counts, no internal configuration (showTermsAndConditions and
 * autoNext are portal mechanics, not buyer-facing copy).
 *
 * measuredQualities is the list of traits the instrument covers, resolved
 * through the questions placed on the questionnaire.
 */
public record PublicProductDetail(
        Long assessmentId,
        String name,
        BigDecimal price,
        String currency,
        String questionnaireName,
        String shortName,
        String category,
        Vertical vertical,
        String description,
        String generalInstruction,
        Integer durationMinutes,
        boolean hasSections,
        int questionCount,
        List<String> measuredQualities) {

    public static PublicProductDetail from(Assessment a, int questionCount,
            List<String> measuredQualities) {
        Questionnaire q = a.getQuestionnaire();
        return new PublicProductDetail(
                a.getAssessmentId(),
                a.getName(),
                a.getPrice(),
                a.getCurrency(),
                q.getName(),
                q.getShortName(),
                q.getCategory(),
                q.getVertical(),
                q.getDescription(),
                q.getGeneralInstruction(),
                q.getDurationMinutes(),
                q.isHasSections(),
                questionCount,
                measuredQualities);
    }
}
