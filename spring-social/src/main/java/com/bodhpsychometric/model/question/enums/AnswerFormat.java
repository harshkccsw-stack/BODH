package com.bodhpsychometric.model.question.enums;

import java.util.regex.Pattern;

/**
 * What a SHORT_ANSWER accepts (V48, 2026-10-08) — Google Forms' "response
 * validation", kept on the short answer instead of being a question type of
 * its own: the answer is the same typed text on the same hidden slot either
 * way, so every writer and reader of answers stays as it was.
 *
 * <pre>
 * TEXT          anything non-blank — what every short answer meant before
 * WHOLE_NUMBER  digits only: 0, 1, 2 … — no sign, no decimal point, no
 *               thousands separator. Stored as typed (leading zeros kept);
 *               Data Studio reads the column as a number.
 * </pre>
 *
 * Null on every other question type. New values go at the END: the MySQL
 * column is an ENUM.
 */
public enum AnswerFormat {
    TEXT,
    WHOLE_NUMBER;

    /**
     * A whole number as the submit validator accepts it. Fifteen digits is
     * the most a double (what Data Studio turns the cell into) holds exactly.
     * Mirrored by typedAnswerProblem in the portal's lib/api.ts.
     */
    public static final Pattern WHOLE_NUMBER_PATTERN = Pattern.compile("[0-9]{1,15}");

    /** The largest whole number the pattern lets through — fifteen nines. */
    public static final long MAX_WHOLE_NUMBER = 999_999_999_999_999L;

    /** True when {@code text} (already trimmed) is acceptable under this format. */
    public boolean accepts(String text) {
        return this != WHOLE_NUMBER || WHOLE_NUMBER_PATTERN.matcher(text).matches();
    }

    /**
     * True when {@code digits} — already accepted by WHOLE_NUMBER — lies in
     * the optional range (V50), both ends inclusive; a null end is open.
     */
    public static boolean inRange(String digits, Long min, Long max) {
        long value = Long.parseLong(digits);
        return (min == null || value >= min) && (max == null || value <= max);
    }

    /**
     * The range in the respondent's words — "from 1 to 5", "of 18 or more",
     * "up to 100" — or null when there is none. Mirrored word for word by
     * rangePhrase in the portal's lib/api.ts, so the server's 400 and the
     * portal's warning say the same thing.
     */
    public static String rangePhrase(Long min, Long max) {
        if (min != null && max != null) {
            return "from " + min + " to " + max;
        }
        if (min != null) {
            return "of " + min + " or more";
        }
        return max == null ? null : "up to " + max;
    }
}
