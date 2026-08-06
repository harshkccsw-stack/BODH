package com.bodhpsychometric.dto;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;
import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.questionnaire.Questionnaire;
import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;
import com.bodhpsychometric.model.questionnaire.Section;

/**
 * Everything the portal take flow renders for one allotment: assessment config,
 * the questionnaire, its sections, questions with options, and the demographic
 * form. Deliberately excludes MQT scores, risk flags, and IRT parameters —
 * scoring data never reaches the respondent's browser.
 */
public record PortalAssessmentDetailResponse(
        Long respondentAssessmentMappingId,
        RespondentAssessmentStatus assessmentStatus,
        boolean isPersisted,
        Long assessmentId,
        String assessmentName,
        boolean showTermsAndConditions,
        boolean autoNext,
        boolean showQuestionIndex,
        Long questionnaireId,
        String questionnaireName,
        String description,
        Integer durationMinutes,
        String generalInstruction,
        boolean hasSections,
        List<PortalDemographicField> demographicFields,
        List<PortalSection> sections,
        List<PortalQuestion> questions) {

    /** A named question group; only present when the questionnaire hasSections. */
    public record PortalSection(Long sectionId, String name, String instruction) {
    }

    /** One question as the respondent sees it — no scoring data. */
    public record PortalQuestion(
            Long questionId,
            Long sectionId,
            int sortOrder,
            ContentType contentType,
            String stem,
            String mediaUrl,
            List<PortalOption> options) {
    }

    /** One selectable option — no scoring data. */
    public record PortalOption(
            Long optionId,
            String optionText,
            ContentType contentType,
            String mediaUrl,
            int sortOrder) {
    }

    /** One row of the pre-assessment demographic form. */
    public record PortalDemographicField(
            Long demographicFieldId,
            String label,
            DemographicFieldType fieldType,
            String placeholder,
            List<String> options,
            boolean required,
            int sortOrder) {
    }

    public static PortalAssessmentDetailResponse from(RespondentAssessmentMapping mapping,
            List<QuestionnaireQuestion> placements,
            List<QuestionnaireDemographicField> demographicMappings) {
        Assessment assessment = mapping.getAssessment();
        Questionnaire questionnaire = assessment.getQuestionnaire();

        // First-appearance order matches question order; the fetch join may
        // duplicate placement rows per option, and entity identity makes
        // distinct() collapse them.
        Map<Long, PortalSection> sections = new LinkedHashMap<>();
        List<PortalQuestion> questions = new ArrayList<>();
        for (QuestionnaireQuestion placement : placements.stream().distinct().toList()) {
            Section section = placement.getSection();
            if (section != null) {
                sections.putIfAbsent(section.getSectionId(),
                        new PortalSection(section.getSectionId(), section.getName(), section.getInstruction()));
            }
            Question question = placement.getQuestion();
            List<PortalOption> options = question.getOptions().stream()
                    .sorted(Comparator.comparingInt(Option::getSortOrder))
                    .map(o -> new PortalOption(o.getOptionId(), o.getOptionText(), o.getContentType(),
                            o.getMediaUrl(), o.getSortOrder()))
                    .toList();
            questions.add(new PortalQuestion(
                    question.getQuestionId(),
                    section == null ? null : section.getSectionId(),
                    placement.getSortOrder(),
                    question.getContentType(),
                    question.getQuestionTexString(),
                    question.getMediaUrl(),
                    options));
        }

        List<PortalDemographicField> demographicFields = demographicMappings.stream()
                .map(qdf -> new PortalDemographicField(
                        qdf.getDemographicField().getDemographicFieldId(),
                        qdf.getDemographicField().getLabel(),
                        qdf.getDemographicField().getFieldType(),
                        qdf.getDemographicField().getPlaceholder(),
                        qdf.getDemographicField().getOptions().stream()
                                .filter(Objects::nonNull)
                                .toList(),
                        qdf.isRequired(),
                        qdf.getSortOrder()))
                .toList();

        return new PortalAssessmentDetailResponse(
                mapping.getRespondentAssessmentMappingId(),
                mapping.getAssessmentStatus(),
                mapping.isPersisted(),
                assessment.getAssessmentId(),
                assessment.getName(),
                assessment.isShowTermsAndConditions(),
                assessment.isAutoNext(),
                assessment.isShowQuestionIndex(),
                questionnaire.getQuestionnaireId(),
                questionnaire.getName(),
                questionnaire.getDescription(),
                questionnaire.getDurationMinutes(),
                questionnaire.getGeneralInstruction(),
                questionnaire.isHasSections(),
                demographicFields,
                List.copyOf(sections.values()),
                questions);
    }
}
