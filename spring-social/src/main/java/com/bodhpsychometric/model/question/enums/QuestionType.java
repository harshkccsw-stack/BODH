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
 * SHORT_ANSWER  free text, the first type with NO options: the answer lands in
 *               AssessmentAnswer.answerText and the question-level MQT score
 *               (if any) is earned for answering, not for what was written
 * PARAGRAPH     long answer — RESERVED. Listed so that widening the MySQL enum
 *               (a table rebuild) is already paid for; QuestionController
 *               refuses it until the UI exists.
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
    PARAGRAPH
}
