package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.question.enums.AnswerFormat;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.question.enums.SelectionRule;

import jakarta.validation.constraints.Size;

/**
 * Payload for creating/updating a bank question. Questions are standalone —
 * attaching them to a questionnaire is the questionnaire-authoring flow, not
 * this payload. Options and both score sets are the full desired state — the
 * backend replaces what is stored to match. The legacy IRT/risk fields are
 * deliberately not exposed.
 *
 * questionType is the SHAPE — MCQ (default, and what a payload written before
 * this field existed means), LINEAR_SCALE, LIKERT_GRID or SHORT_ANSWER. On a
 * LINEAR_SCALE the options list is IGNORED: the backend generates the points
 * scaleFrom—scaleTo (both omitted = 1—5) and derives their MQT scores from
 * mqtScores. On a LIKERT_GRID the options ARE the shared columns — scored
 * exactly as an MCQ's options are — and rows carry the items, each naming the
 * MQTs it measures. rows is ignored on every other type. A SHORT_ANSWER takes
 * neither options nor rows; only its stem and its question-level scores.
 * A GAMES question takes gameId (required there, refused everywhere else) and
 * no options: the backend GENERATES its one option and links it to that game,
 * the way a scale's points are generated from its range.
 *
 * shuffleOptions randomises the order the options are DELIVERED in — MCQ only
 * (a scale's points and a grid's columns are ordinal, and both are refused).
 * Omitted or null means false, the authored order, which is what every payload
 * written before the field existed means.
 *
 * selectionRule + selectionCount say how many options the respondent may pick
 * (MIN/MAX/EQUALS n). Both omitted = single choice, so callers written before
 * they existed keep meaning exactly what they meant. They cannot be validated
 * by annotations — the count is checked against the option list — so
 * QuestionController does it by hand, in bulk pass 1 as well.
 *
 * A GROUP (V49) is an optional heading (the ONE type whose stem may be blank
 * — the required-stem rule therefore lives in validateType now, not on an
 * annotation) plus `members`: full QuestionRequests, validated by the same
 * per-type rules as standalone questions. On a group UPDATE each member
 * carries its own `questionId` so the backend can tell an edit from a new
 * member; null id = new. The parent itself takes no options, rows, scores,
 * rule, shuffle, game or format — only heading, description and members.
 */
public record QuestionRequest(
        /**
         * GROUP members on an update only: which stored member this payload
         * edits. Ignored (and best omitted) everywhere else — a standalone
         * question's id is the path variable.
         */
        Long questionId,
        ContentType contentType,
        QuestionType questionType,
        String stem,
        /**
         * Optional help text under the stem, shown to the respondent. Omitted,
         * null and blank all mean "no description", so a caller written before
         * this field existed keeps meaning exactly what it meant.
         */
        String description,
        String mediaUrl,
        Boolean riskFlag,
        SelectionRule selectionRule,
        Integer selectionCount,
        Integer scaleFrom,
        Integer scaleTo,
        Boolean shuffleOptions,
        @Size(max = 100, message = "scaleLowLabel is at most 100 characters")
        String scaleLowLabel,
        @Size(max = 100, message = "scaleHighLabel is at most 100 characters")
        String scaleHighLabel,
        List<QuestionOptionRequest> options,
        List<QuestionRowRequest> rows,
        List<MqtScoreRequest> mqtScores,
        /**
         * GAMES only: the catalog game the question's one option launches.
         * Omitted on every other type — a payload written before games existed
         * keeps meaning exactly what it meant.
         */
        Long gameId,
        /**
         * SHORT_ANSWER only: TEXT or WHOLE_NUMBER (V48). Omitted or null on a
         * short answer means TEXT, what every short answer meant before it
         * existed; refused on every other type, like gameId.
         */
        AnswerFormat answerFormat,
        /**
         * WHOLE_NUMBER short answers only (V50): the smallest and largest
         * number accepted, inclusive. Either may be omitted (an open end);
         * both omitted = any whole number. Refused on anything else. Once the
         * question has answers the range may only widen.
         */
        Long answerMin,
        Long answerMax,
        /**
         * GROUP only (V49): the member questions, in display order. At least
         * two; each validated by the same per-type rules as a standalone
         * question (MCQ, LINEAR_SCALE or SHORT_ANSWER). Refused on every
         * other type. On an update, a member with a questionId edits that
         * stored member; without one it is created; stored members missing
         * from the list are removed — refused once any member has answers
         * (membership is frozen) or while the group is placed.
         */
        List<QuestionRequest> members) {
}
