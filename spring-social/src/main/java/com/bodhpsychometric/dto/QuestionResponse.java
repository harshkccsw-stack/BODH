package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.enums.AnswerFormat;
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
 * the range and the two scale labels are set only on a LINEAR_SCALE, whose
 * options are the generated points scaleFrom—scaleTo carrying the derived
 * per-point scores (a null range means 1—5). On a LIKERT_GRID the options are
 * the shared columns and rows are the items, each naming the MQTs it measures;
 * rows is empty on every other type. A SHORT_ANSWER has neither.
 * answerFormat is what a SHORT_ANSWER accepts (TEXT or WHOLE_NUMBER, never
 * null there) and null on every other type; answerMin/answerMax are the
 * optional inclusive range of a WHOLE_NUMBER one, null elsewhere.
 *
 * optional is placement context like sectionId: whether THIS questionnaire
 * lets the respondent leave the question blank. Null in bank-wide reads.
 *
 * A GROUP parent (V49) carries its members nested, each a full
 * QuestionResponse; stem is its optional heading and may be null. A MEMBER
 * (read through a questionnaire, where it is a placement like any other)
 * carries parentQuestionId plus the parent's heading/description, so the
 * builder and the preview can fold consecutive members back into their group
 * without a second fetch. Both are null/empty everywhere else.
 */
public record QuestionResponse(
        Long questionId,
        List<UsedInRef> usedIn,
        Long sectionId,
        Integer sortOrder,
        String questionTag,
        Boolean optional,
        ContentType contentType,
        QuestionType questionType,
        String stem,
        /** Help text under the stem; null when the author set none. */
        String description,
        String mediaUrl,
        boolean riskFlag,
        SelectionRule selectionRule,
        Integer selectionCount,
        boolean shuffleOptions,
        Integer scaleFrom,
        Integer scaleTo,
        String scaleLowLabel,
        String scaleHighLabel,
        AnswerFormat answerFormat,
        Long answerMin,
        Long answerMax,
        List<QuestionOptionResponse> options,
        List<QuestionRowResponse> rows,
        List<MqtScoreResponse> mqtScores,
        Long parentQuestionId,
        String groupHeading,
        String groupDescription,
        List<QuestionResponse> members) {

    /** One questionnaire that uses this question. */
    public record UsedInRef(Long questionnaireId, String name) {
    }

    public static QuestionResponse from(Question q, List<UsedInRef> usedIn, Long sectionId, Integer sortOrder,
            String questionTag, Boolean optional, List<QuestionOptionResponse> options,
            List<QuestionRowResponse> rows, List<MqtScoreResponse> mqtScores,
            List<QuestionResponse> members) {
        return new QuestionResponse(
                q.getQuestionId(),
                usedIn,
                sectionId,
                sortOrder,
                questionTag,
                optional,
                q.getContentType(),
                q.getQuestionType(),
                q.getQuestionTexString(),
                q.getDescription(),
                q.getMediaUrl(),
                q.isRiskFlag(),
                q.getSelectionRule(),
                q.getSelectionCount(),
                q.isShuffleOptions(),
                q.getScaleFrom(),
                q.getScaleTo(),
                q.getScaleLowLabel(),
                q.getScaleHighLabel(),
                q.answerFormat(),
                q.getAnswerMin(),
                q.getAnswerMax(),
                options,
                rows,
                mqtScores,
                q.getParentQuestion() == null ? null : q.getParentQuestion().getQuestionId(),
                q.getParentQuestion() == null ? null : q.getParentQuestion().getQuestionTexString(),
                q.getParentQuestion() == null ? null : q.getParentQuestion().getDescription(),
                members);
    }
}
