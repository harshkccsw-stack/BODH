package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.AssessmentTerms;
import com.bodhpsychometric.model.assessment.AssessmentThankYou;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.assessment.enums.QuestionLayout;

/**
 * Catalog view of an assessment. questionnaireName is denormalized for list
 * rendering; respondentCount is the number of attempt rows — the caller
 * counts via repository so the entity stays collection-free.
 */
public record AssessmentResponse(
        Long assessmentId,
        String name,
        Long questionnaireId,
        String questionnaireName,
        boolean showTermsAndConditions,
        /** Always populated — the default body when the row has none of its own. */
        String termsAndConditions,
        /** Always populated — the default message when the row has none of its own. */
        String thankYouMessage,
        /** Who respondents can reach (contact person / researcher); both null when unset. */
        String contactName,
        String contactEmail,
        AssessmentStatus status,
        boolean autoNext,
        boolean showQuestionIndex,
        /** One question per page, or a whole section per scrollable page. */
        QuestionLayout questionLayout,
        /** Focus popup on a 10-minute deadline; sitting one out abandons the attempt. */
        boolean attentionTimer,
        /** Redis partial-answer saving on section change; resume backfills. */
        boolean savePartialAnswers,
        /** Availability window — metadata only; nothing gates on it yet. */
        LocalDate startDate,
        LocalDate endDate,
        int respondentCount) {

    public static AssessmentResponse from(Assessment a, int respondentCount) {
        return new AssessmentResponse(
                a.getAssessmentId(),
                a.getName(),
                a.getQuestionnaire().getQuestionnaireId(),
                a.getQuestionnaire().getName(),
                a.isShowTermsAndConditions(),
                // The editor should open on the text respondents would see,
                // so send the default rather than null for rows without one.
                AssessmentTerms.effective(a.getTermsAndConditions()),
                // Same reasoning: open the editor on what respondents would see.
                AssessmentThankYou.effective(a.getThankYouMessage()),
                a.getContactName(),
                a.getContactEmail(),
                a.getStatus(),
                a.isAutoNext(),
                a.isShowQuestionIndex(),
                a.getQuestionLayout(),
                a.isAttentionTimer(),
                a.isSavePartialAnswers(),
                a.getStartDate(),
                a.getEndDate(),
                respondentCount);
    }
}
