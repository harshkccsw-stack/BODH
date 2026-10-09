package com.bodhpsychometric.model.question.enums;

/**
 * What SHAPE a question is — the Google-Forms "question type" dropdown. It
 * decides what the author fills in and what the respondent is shown; it is a
 * different axis from {@link SelectionRule} (how MANY options may be picked)
 * and from {@link ContentType} (what the stem is MADE of).
 *
 * <pre>
 * MCQ           options the author writes, each carrying its own MQT scores
 * LINEAR_SCALE  points scaleFrom—scaleTo, generated; only the QUESTION is
 *               mapped to MQTs and the point picked IS the score
 * LIKERT_GRID   rows (each naming its own MQTs) x columns (ordinary options
 *               carrying the scores) — one pick per row
 * SHORT_ANSWER  free text, the first type with NO options to choose: the
 *               answer lands in AssessmentAnswer.answerText, on the question's
 *               one hidden, generated text slot (V40), and the question-level
 *               MQT score (if any) is earned for answering, not for what was
 *               written
 * PARAGRAPH     long answer — RESERVED. Listed so that widening the MySQL enum
 *               (a table rebuild) is already paid for; QuestionController
 *               refuses it until the UI exists.
 * GAMES         a browser game (V42, 2026-10-06): exactly ONE option, GENERATED
 *               from QuestionRequest.gameId and linked to a catalog Game, which
 *               any number of questions may share (V43). The portal shows it
 *               with a Launch button and renders the
 *               game whose code the option carries; finishing the game picks the
 *               option, so the answer row is an ordinary optionId. What a game's
 *               results store is not decided yet — the portal only logs them.
 * GROUP         an optional heading over MEMBER questions (V49, 2026-10-08),
 *               each a full Question of its own (own options, own scores)
 *               hanging off the parent by parentQuestionId. The parent is
 *               never placed, delivered or answered — its members carry the
 *               placements, tags and answer rows — so everything keyed on
 *               "the questions of a questionnaire" sees ordinary questions.
 *               The members travel together: one page in the portal, options
 *               laid out horizontally. Members may be MCQ, LINEAR_SCALE or
 *               SHORT_ANSWER; GAMES, LIKERT_GRID and GROUP are refused
 *               (QuestionController.validateType).
 * </pre>
 *
 * MCQ is the default and is exactly what every question meant before this
 * existed, so every pre-existing row is already correct — no backfill.
 * FREE_TEXT and RANKING will join this enum when they arrive
 * ({@code AssessmentAnswer} already reserves answerText and rankOrder).
 */
public enum QuestionType {
    MCQ,
    LINEAR_SCALE,
    LIKERT_GRID,
    SHORT_ANSWER,
    PARAGRAPH,
    GAMES,
    GROUP
}
