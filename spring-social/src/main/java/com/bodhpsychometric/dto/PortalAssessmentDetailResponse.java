package com.bodhpsychometric.dto;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

import com.bodhpsychometric.dto.PortalQuestionnaireContent.ContentQuestion;
import com.bodhpsychometric.dto.PortalSubmitRequest.AnswerEntry;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.AssessmentTerms;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.question.enums.SelectionRule;

/**
 * Everything the portal take flow renders for one allotment: assessment config,
 * the questionnaire, its sections, questions with options, and the demographic
 * form. Deliberately excludes MQT scores, risk flags, and IRT parameters —
 * scoring data never reaches the respondent's browser.
 *
 * <p>Assembled from two halves with different lifetimes: the
 * questionnaire-shaped content comes from {@link PortalQuestionnaireContent}
 * (Redis-cached, shared by every attempt of the questionnaire) and the
 * attempt/assessment fields are read live off the mapping — which is why an
 * assessment toggle flips take effect immediately while the heavy content is
 * served from cache. The per-attempt option shuffle happens HERE, after the
 * cache, so the cache entry stays shareable.
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
        /**
         * Arms the portal's 10-minute attention budget: the focus popup's
         * open time is counted down across the attempt, and running out
         * abandons it (see the abandon endpoint). The BUDGET itself is the
         * portal's constant — only whether it applies is stored here.
         */
        boolean attentionTimer,
        /**
         * Arms partial-answer saving: the portal snapshots marked answers to
         * the progress endpoint on section change, and an ONGOING attempt is
         * resumed with {@code savedAnswers} backfilled.
         */
        boolean savePartialAnswers,
        Long questionnaireId,
        String questionnaireName,
        String description,
        Integer durationMinutes,
        String generalInstruction,
        boolean hasSections,
        List<PortalDemographicField> demographicFields,
        List<PortalSection> sections,
        List<PortalQuestion> questions,
        /**
         * The attempt's partial-answer snapshot, in submit-entry shape, so a
         * resumed attempt backfills without a second call. Null when there is
         * none — a fresh attempt, the toggle off, or Redis unavailable — and
         * the portal starts from question 1 exactly as before.
         */
        List<AnswerEntry> savedAnswers) {

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
            /**
             * LINEAR_SCALE only: the ends of the slider. The portal renders
             * the track from THESE, not from options.size() — a 0—100 scale
             * is a slider, never a hundred buttons — and maps the value the
             * respondent lands on back to the option carrying that number.
             */
            Integer scaleFrom,
            Integer scaleTo,
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
            PortalQuestionnaireContent content,
            List<AnswerEntry> savedAnswers) {
        Assessment assessment = mapping.getAssessment();

        List<PortalQuestion> questions = content.questions().stream()
                .map(q -> deliveredQuestion(q, mapping.getRespondentAssessmentMappingId()))
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
                assessment.isAttentionTimer(),
                assessment.isSavePartialAnswers(),
                content.questionnaireId(),
                content.questionnaireName(),
                content.description(),
                content.durationMinutes(),
                content.generalInstruction(),
                content.hasSections(),
                content.demographicFields(),
                content.sections(),
                questions,
                savedAnswers);
    }

    /** The cached question re-shaped for THIS attempt — shuffle applied, flag dropped. */
    private static PortalQuestion deliveredQuestion(ContentQuestion q, Long mappingId) {
        return new PortalQuestion(
                q.questionId(),
                q.sectionId(),
                q.sortOrder(),
                q.contentType(),
                q.questionType(),
                q.stem(),
                q.mediaUrl(),
                q.selectionRule(),
                q.selectionCount(),
                q.minSelections(),
                q.maxSelections(),
                q.scaleFrom(),
                q.scaleTo(),
                q.scaleLowLabel(),
                q.scaleHighLabel(),
                q.rows(),
                deliveredOptions(q, mappingId));
    }

    /**
     * The options in the order THIS attempt is to be shown them: the authored
     * order (how the cache stores them), or — when the author ticked
     * shuffleOptions — a random one.
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
    private static List<PortalOption> deliveredOptions(ContentQuestion question, Long mappingId) {
        // The flag is only ever stored on an MCQ, but delivery is the last
        // gate before a respondent's screen — re-checking the type here means
        // no row edited around QuestionController can scramble a rating scale.
        if (!question.shuffleOptions() || question.questionType() != QuestionType.MCQ) {
            return question.options();
        }
        List<PortalOption> shuffled = new ArrayList<>(question.options());
        Collections.shuffle(shuffled, new Random(31L * mappingId + question.questionId()));
        List<PortalOption> delivered = new ArrayList<>(shuffled.size());
        for (int i = 0; i < shuffled.size(); i++) {
            PortalOption o = shuffled.get(i);
            delivered.add(new PortalOption(o.optionId(), o.optionText(), o.contentType(),
                    o.mediaUrl(), i));
        }
        return delivered;
    }
}
