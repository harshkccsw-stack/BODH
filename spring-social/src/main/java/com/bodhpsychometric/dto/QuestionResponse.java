package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.question.enums.SelectionRule;

/**
 * A bank question with its options and MQT scores. usedIn lists every
 * questionnaire the question appears in (empty = unattached). sectionId,
 * sortOrder and questionTag are placement context — filled only when the
 * question is read through one questionnaire (getByQuestionnaireId), null in
 * bank-wide reads because a question placed in several questionnaires has
 * several placements (and a different tag in each).
 *
 * shuffleOptions is delivery order only — the options in THIS response are
 * always the authored ones, in sortOrder; the randomising happens per attempt
 * in the portal payload.
 *
 * selectionRule/selectionCount are both null on single-choice questions.
 * questionType is never null (MCQ for everything authored before it existed);
 * the two scale labels are set only on a LINEAR_SCALE, whose options are the
 * generated points 1—5 carrying the derived per-point scores. On a
 * LIKERT_GRID the options are the shared columns and rows are the items, each
 * naming the MQTs it measures; rows is empty on every other type.
 */
public record QuestionResponse(
        Long questionId,
        List<UsedInRef> usedIn,
        Long sectionId,
        Integer sortOrder,
        String questionTag,
        ContentType contentType,
        QuestionType questionType,
        String stem,
        String mediaUrl,
        boolean riskFlag,
        SelectionRule selectionRule,
        Integer selectionCount,
        boolean shuffleOptions,
        String scaleLowLabel,
        String scaleHighLabel,
        List<QuestionOptionResponse> options,
        List<QuestionRowResponse> rows,
        List<MqtScoreResponse> mqtScores) {

    /** One questionnaire that uses this question. */
    public record UsedInRef(Long questionnaireId, String name) {
    }

    public static QuestionResponse from(Question q, List<UsedInRef> usedIn, Long sectionId, Integer sortOrder,
            String questionTag, List<QuestionOptionResponse> options, List<QuestionRowResponse> rows,
            List<MqtScoreResponse> mqtScores) {
        return new QuestionResponse(
                q.getQuestionId(),
                usedIn,
                sectionId,
                sortOrder,
                questionTag,
                q.getContentType(),
                q.getQuestionType(),
                q.getQuestionTexString(),
                q.getMediaUrl(),
                q.isRiskFlag(),
                q.getSelectionRule(),
                q.getSelectionCount(),
                q.isShuffleOptions(),
                q.getScaleLowLabel(),
                q.getScaleHighLabel(),
                options,
                rows,
                mqtScores);
    }
}
