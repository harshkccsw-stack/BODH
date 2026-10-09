package com.bodhpsychometric.dto;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.bodhpsychometric.dto.PortalAssessmentDetailResponse.PortalDemographicField;
import com.bodhpsychometric.dto.PortalAssessmentDetailResponse.PortalOption;
import com.bodhpsychometric.dto.PortalAssessmentDetailResponse.PortalRow;
import com.bodhpsychometric.dto.PortalAssessmentDetailResponse.PortalSection;
import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.QuestionRow;
import com.bodhpsychometric.model.question.SelectionBounds;
import com.bodhpsychometric.model.question.enums.AnswerFormat;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.question.enums.SelectionRule;
import com.bodhpsychometric.model.questionnaire.Questionnaire;
import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;
import com.bodhpsychometric.model.questionnaire.Section;

/**
 * The QUESTIONNAIRE-SHAPED part of the portal take payload — everything that
 * depends only on the questionnaire's authored content and nothing on who is
 * taking it. This is the unit the Redis content cache stores (one entry per
 * questionnaire, JSON, 1-day TTL, evicted on authoring writes), so under load
 * ten thousand attempts of one assessment read MySQL once, not ten thousand
 * times.
 *
 * <p>Two things are deliberately NOT here, because they vary per attempt and
 * would poison a shared cache entry: the attempt/assessment fields
 * (status, toggles, terms — read live off the mapping), and the option
 * SHUFFLE, which is seeded on (mappingId, questionId). Options are stored in
 * AUTHORED order with {@code shuffleOptions} kept as a flag per question;
 * {@link PortalAssessmentDetailResponse} applies the shuffle at assembly.
 *
 * <p>Everything is questionnaire-delivery order already (see DISPLAY_ORDER),
 * and the same object doubles as the submit validator's source of truth —
 * option/row membership, selection bounds and navigator labels are all
 * derivable from it without touching MySQL.
 */
public record PortalQuestionnaireContent(
        Long questionnaireId,
        String questionnaireName,
        String description,
        Integer durationMinutes,
        String generalInstruction,
        boolean hasSections,
        List<PortalDemographicField> demographicFields,
        List<PortalSection> sections,
        List<ContentQuestion> questions) {

    /**
     * {@link PortalAssessmentDetailResponse.PortalQuestion} plus the one
     * authoring fact assembly still needs: {@code shuffleOptions}. The flag
     * never reaches the respondent — assembly consumes it and drops it.
     * {@code options} are in authored order, sortOrder = authored position.
     */
    public record ContentQuestion(
            Long questionId,
            Long sectionId,
            int sortOrder,
            /**
             * The placement's "may be left blank" flag. A cache entry written
             * before the flag existed deserialises it as false — required,
             * which is exactly what every question was then — so the polarity
             * is chosen to make a stale entry harmless.
             */
            boolean optional,
            ContentType contentType,
            QuestionType questionType,
            String stem,
            /**
             * Help text under the stem. Safe in a SHARED cache entry: it is
             * authored on the question, identical for everyone taking the
             * questionnaire, and an authoring write already evicts this entry
             * (PortalContentService.evictForQuestion). A cache entry written
             * before this field existed simply deserialises it as null and
             * renders as it did before — and the write that adds a description
             * is itself what evicts that entry.
             */
            String description,
            String mediaUrl,
            SelectionRule selectionRule,
            Integer selectionCount,
            int minSelections,
            int maxSelections,
            Integer scaleFrom,
            Integer scaleTo,
            String scaleLowLabel,
            String scaleHighLabel,
            /**
             * What a SHORT_ANSWER accepts (V48); null on every other type. A
             * cache entry written before the field existed deserialises it as
             * null, read as TEXT — the permissive side, so a stale entry can
             * let text through until it is evicted but never blocks anyone.
             */
            AnswerFormat answerFormat,
            boolean shuffleOptions,
            List<PortalRow> rows,
            List<PortalOption> options,
            /**
             * GROUP members only (V49): the parent question this one belongs
             * to, plus the parent's heading and help text (repeated on every
             * member so no second lookup exists to disagree with). The portal
             * folds consecutive questions sharing a groupId into one page.
             * Null on every other question — and in a cache entry written
             * before groups existed, which could not contain a member anyway.
             */
            Long groupId,
            String groupHeading,
            String groupDescription) {
    }

    /**
     * The order the respondent is walked through the questionnaire: every
     * question of section 1, then every question of section 2, and so on;
     * section-less placements (their section was deleted) last.
     *
     * The delivery query already sorts this way — repeated in Java because
     * THIS is the respondent-facing path: a caller handing an unsorted list
     * must not be able to interleave the sections again, and sorting a few
     * dozen already-ordered rows costs nothing.
     *
     * Note that a placement's own sortOrder is per-SECTION (the wizard numbers
     * each section from 0), which is precisely why it cannot be the first key.
     */
    private static final Comparator<QuestionnaireQuestion> DISPLAY_ORDER =
            Comparator.comparingInt((QuestionnaireQuestion p) -> p.getSection() == null ? 1 : 0)
                    .thenComparingInt(p -> p.getSection() == null ? 0 : p.getSection().getSortOrder())
                    .thenComparingLong(p -> p.getSection() == null ? 0L : p.getSection().getSectionId())
                    .thenComparingInt(QuestionnaireQuestion::getSortOrder)
                    .thenComparingLong(QuestionnaireQuestion::getQuestionnaireQuestionId);

    public static PortalQuestionnaireContent build(Questionnaire questionnaire,
            List<QuestionnaireQuestion> placements,
            List<QuestionnaireDemographicField> demographicMappings) {
        // Collected by first appearance (the fetch join may duplicate
        // placement rows per option, and entity identity makes distinct()
        // collapse them), then sorted by the section's own sortOrder before
        // being emitted — question order must not decide section order.
        Map<Long, PortalSection> sections = new LinkedHashMap<>();
        List<ContentQuestion> questions = new ArrayList<>();
        for (QuestionnaireQuestion placement : placements.stream().distinct().sorted(DISPLAY_ORDER).toList()) {
            Section section = placement.getSection();
            if (section != null) {
                sections.putIfAbsent(section.getSectionId(),
                        new PortalSection(section.getSectionId(), section.getName(), section.getInstruction(),
                                section.isShowInstructionOnEachQuestion(), section.getQuestionLayout(),
                                section.getSortOrder()));
            }
            Question question = placement.getQuestion();
            Question group = question.getParentQuestion();
            SelectionBounds bounds = SelectionBounds.of(question);
            questions.add(new ContentQuestion(
                    question.getQuestionId(),
                    section == null ? null : section.getSectionId(),
                    placement.getSortOrder(),
                    placement.isOptional(),
                    question.getContentType(),
                    question.getQuestionType(),
                    question.getQuestionTexString(),
                    question.getDescription(),
                    question.getMediaUrl(),
                    question.getSelectionRule(),
                    question.getSelectionCount(),
                    bounds.floor(),
                    bounds.cap(),
                    question.getScaleFrom(),
                    question.getScaleTo(),
                    question.getScaleLowLabel(),
                    question.getScaleHighLabel(),
                    question.answerFormat(),
                    question.isShuffleOptions(),
                    question.getRows().stream()
                            .sorted(Comparator.comparingInt(QuestionRow::getSortOrder))
                            .map(r -> new PortalRow(r.getQuestionRowId(), r.getRowText(), r.getSortOrder()))
                            .toList(),
                    authoredOptions(question),
                    group == null ? null : group.getQuestionId(),
                    group == null ? null : group.getQuestionTexString(),
                    group == null ? null : group.getDescription()));
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
                        qdf.getDemographicField().getOtherOptionLabel(),
                        qdf.isRequired(),
                        qdf.getSortOrder()))
                .toList();

        return new PortalQuestionnaireContent(
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
     * Authored order, sortOrder = authored position — shuffling is assembly's.
     * Choices only: a short answer's generated text slot is not one (see
     * Question.choiceOptions), so the portal and MemoryMesh's import still see
     * a short answer with no options. The submit writer attaches it.
     */
    private static List<PortalOption> authoredOptions(Question question) {
        List<Option> authored = question.choiceOptions().stream()
                .sorted(Comparator.comparingInt(Option::getSortOrder))
                .toList();
        List<PortalOption> out = new ArrayList<>(authored.size());
        for (int i = 0; i < authored.size(); i++) {
            Option o = authored.get(i);
            out.add(new PortalOption(o.getOptionId(), o.getOptionText(), o.getDescription(),
                    o.getContentType(), o.getMediaUrl(), i, GameRef.from(o.getGame())));
        }
        return out;
    }
}
