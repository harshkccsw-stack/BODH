package com.bodhpsychometric.dto;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import java.util.stream.Collectors;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.AssessmentTerms;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;
import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.QuestionRow;
import com.bodhpsychometric.model.question.SelectionBounds;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.question.enums.SelectionRule;
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
        /**
         * Consent body to render when showTermsAndConditions is true. Never
         * null — assessments with no text of their own get the default — so
         * the portal never has to decide what the terms say.
         */
        String termsAndConditions,
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

    /**
     * A named question group; only present when the questionnaire hasSections.
     * The list arrives already sorted by sortOrder — the author's arrangement,
     * which is also what the Section_A/B/C report tags follow.
     */
    public record PortalSection(Long sectionId, String name, String instruction, int sortOrder) {
    }

    /**
     * One question as the respondent sees it — no scoring data.
     *
     * questionType is what to RENDER: MCQ is the stacked option list,
     * LINEAR_SCALE is the points 1—5 laid out between scaleLowLabel and
     * scaleHighLabel. It changes nothing about the answer — a scale is a
     * cap-1 question, so every gate below still reads min/maxSelections.
     *
     * selectionRule/selectionCount are how many options may be picked; both
     * null means single choice. They are presentation, not scoring: the
     * portal needs them to render checkboxes instead of radios, show the
     * hint, and enable Next only once the rule is satisfied. minSelections /
     * maxSelections are the same pair already resolved into a floor and a cap
     * by SelectionBounds, sent so the portal and the submit validator can
     * never disagree about what a rule means.
     */
    public record PortalQuestion(
            Long questionId,
            Long sectionId,
            int sortOrder,
            ContentType contentType,
            QuestionType questionType,
            String stem,
            String mediaUrl,
            SelectionRule selectionRule,
            Integer selectionCount,
            int minSelections,
            int maxSelections,
            String scaleLowLabel,
            String scaleHighLabel,
            List<PortalRow> rows,
            List<PortalOption> options) {
    }

    /**
     * One row of a LIKERT_GRID — the item rated against the shared columns
     * (the options). Empty on every other type, which is how the portal
     * decides between a table and a list. Which MQTs a row measures is
     * deliberately NOT here: that is scoring, and scoring never reaches the
     * respondent's browser.
     */
    public record PortalRow(Long questionRowId, String rowText, int sortOrder) {
    }

    /**
     * One selectable option — no scoring data. The list is already in DELIVERY
     * order (shuffled per attempt when the author asked for it), and sortOrder
     * is that delivered position, not the authored one: render the list as it
     * arrives and never re-sort it.
     */
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

        // Collected by first appearance (the fetch join may duplicate
        // placement rows per option, and entity identity makes distinct()
        // collapse them), then sorted by the section's own sortOrder before
        // being emitted — question order must not decide section order.
        Map<Long, PortalSection> sections = new LinkedHashMap<>();
        List<PortalQuestion> questions = new ArrayList<>();
        for (QuestionnaireQuestion placement : placements.stream().distinct().toList()) {
            Section section = placement.getSection();
            if (section != null) {
                sections.putIfAbsent(section.getSectionId(),
                        new PortalSection(section.getSectionId(), section.getName(), section.getInstruction(),
                                section.getSortOrder()));
            }
            Question question = placement.getQuestion();
            List<PortalOption> options = deliveredOptions(question,
                    mapping.getRespondentAssessmentMappingId());
            SelectionBounds bounds = SelectionBounds.of(question);
            questions.add(new PortalQuestion(
                    question.getQuestionId(),
                    section == null ? null : section.getSectionId(),
                    placement.getSortOrder(),
                    question.getContentType(),
                    question.getQuestionType(),
                    question.getQuestionTexString(),
                    question.getMediaUrl(),
                    question.getSelectionRule(),
                    question.getSelectionCount(),
                    bounds.floor(),
                    bounds.cap(),
                    question.getScaleLowLabel(),
                    question.getScaleHighLabel(),
                    question.getRows().stream()
                            .sorted(Comparator.comparingInt(QuestionRow::getSortOrder))
                            .map(r -> new PortalRow(r.getQuestionRowId(), r.getRowText(), r.getSortOrder()))
                            .toList(),
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
                AssessmentTerms.effective(assessment.getTermsAndConditions()),
                assessment.isAutoNext(),
                assessment.isShowQuestionIndex(),
                questionnaire.getQuestionnaireId(),
                questionnaire.getName(),
                questionnaire.getDescription(),
                questionnaire.getDurationMinutes(),
                questionnaire.getGeneralInstruction(),
                questionnaire.isHasSections(),
                demographicFields,
                sections.values().stream()
                        .sorted(Comparator.comparingInt(PortalSection::sortOrder)
                                .thenComparing(PortalSection::sectionId))
                        .toList(),
                questions);
    }

    /**
     * The options in the order THIS attempt is to be shown them: the authored
     * order, or — when the author ticked shuffleOptions — a random one.
     *
     * The random order is derived, never stored. Seeding on
     * (attempt, question) buys three things at once: it is the same order every
     * time this attempt loads the assessment, so a mid-take refresh does not
     * rearrange the screen; it differs between two respondents and between two
     * attempts by the same respondent, which is the point of the feature; and
     * it can be recomputed afterwards from two ids, so "what did they actually
     * see?" is still answerable (the option set is frozen once anyone answers).
     *
     * sortOrder is renumbered to the DELIVERED position rather than left at the
     * authored one, for the same reason the resolved minSelections/maxSelections
     * are sent: the list and the field cannot then disagree, and a client that
     * sorts by sortOrder cannot silently undo the shuffle.
     */
    private static List<PortalOption> deliveredOptions(Question question, Long mappingId) {
        List<Option> authored = question.getOptions().stream()
                .sorted(Comparator.comparingInt(Option::getSortOrder))
                .collect(Collectors.toCollection(ArrayList::new));
        // The flag is only ever stored on an MCQ, but delivery is the last
        // gate before a respondent's screen — re-checking the type here means
        // no row edited around QuestionController can scramble a rating scale.
        if (question.isShuffleOptions() && question.getQuestionType() == QuestionType.MCQ) {
            Collections.shuffle(authored, new Random(31L * mappingId + question.getQuestionId()));
        }
        List<PortalOption> delivered = new ArrayList<>(authored.size());
        for (int i = 0; i < authored.size(); i++) {
            Option o = authored.get(i);
            delivered.add(new PortalOption(o.getOptionId(), o.getOptionText(), o.getContentType(),
                    o.getMediaUrl(), i));
        }
        return delivered;
    }
}
