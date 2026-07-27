package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;

/**
 * One assessment a respondent holds, as the report's info popup shows it:
 * what was allotted (assessment + its questionnaire), where the respondent
 * got to (attemptStatus, isPersisted) and how much of the answer set actually
 * landed (answeredQuestions of totalQuestions, plus the demographic count).
 *
 * answeredQuestions/demographicResponses are counted off the (respondent,
 * assessment) pair, which is where both sets hang — see AssessmentAnswer.
 * They are what a reset wipes.
 */
public record ReportRespondentAssessmentRow(
        Long respondentAssessmentMappingId,
        Long assessmentId,
        String assessmentName,
        AssessmentStatus assessmentStatus,
        Long questionnaireId,
        String questionnaireName,
        RespondentAssessmentStatus attemptStatus,
        boolean isPersisted,
        long answeredQuestions,
        long totalQuestions,
        long demographicResponses) {

    public static ReportRespondentAssessmentRow from(RespondentAssessmentMapping mapping,
            long answeredQuestions, long totalQuestions, long demographicResponses) {
        return new ReportRespondentAssessmentRow(
                mapping.getRespondentAssessmentMappingId(),
                mapping.getAssessment().getAssessmentId(),
                mapping.getAssessment().getName(),
                mapping.getAssessment().getStatus(),
                mapping.getAssessment().getQuestionnaire().getQuestionnaireId(),
                mapping.getAssessment().getQuestionnaire().getName(),
                mapping.getAssessmentStatus(),
                mapping.isPersisted(),
                answeredQuestions,
                totalQuestions,
                demographicResponses);
    }
}
