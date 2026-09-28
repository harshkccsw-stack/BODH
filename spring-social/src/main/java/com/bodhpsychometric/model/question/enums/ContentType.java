package com.bodhpsychometric.model.question.enums;

/**
 * What a question stem or an option is made of. TEXT lives in the text
 * column; IMAGE and VIDEO are uploaded assets whose location sits in
 * mediaUrl; URL is an externally hosted image or video linked in mediaUrl.
 *
 * <p>FREE_TEXT is OPTIONS ONLY (2026-09-28): the Google-Forms "Other…" row.
 * The option is picked like any other and its optionText is the LABEL on the
 * button; picking it opens a box, and what the respondent types lands in
 * {@code AssessmentAnswer.answerText} on the SAME row as the optionId. It is
 * not the {@code SHORT_ANSWER} question type — that is a whole question with
 * no options. QuestionController refuses it on a stem, on anything but an
 * MCQ, and more than once per question; `question.content_type` in MySQL was
 * deliberately NOT widened for it (V36 widens `question_option` only).
 */
public enum ContentType {
    TEXT,
    IMAGE,
    VIDEO,
    URL,
    FREE_TEXT
}
