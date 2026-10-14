package com.bodhpsychometric.dto.validation;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The one definition of what a person's name may contain — respondents and
 * practitioners alike (2026-10-13). Until then a name was checked for "not
 * blank" and nothing else, so digits, emails, emoji and markup all landed in
 * the profile and from there in reports and exports.
 *
 * <p>Allowed: letters of ANY script, combining marks, spaces, apostrophes
 * ({@code '} and the typographic {@code ’} a phone keyboard inserts), hyphens
 * and full stops — and at least one letter. Marks and the two zero-width
 * joiners are not decoration: Devanagari vowel signs are marks and Indic
 * half-forms need ZWJ/ZWNJ, so "प्रिया शर्मा" would fail without them. Digits of
 * every script are refused, as is every other symbol.
 *
 * <p>Applied at every place a name is TYPED: the portal's /register/{token},
 * the dashboard respondent and practitioner forms, the wizard's inline rows
 * (all through {@link PersonName}) and the XLSX sheet, which calls
 * {@link #characterProblem(String)} directly to answer with a numbered row
 * issue. Deliberately NOT applied to the MemoryMesh wires: the person was
 * already created over there, and a 400 here only stops the two systems
 * agreeing (a refused attempt sync would drop a finished attempt).
 *
 * <p>The frontends mirror this word for word in {@code lib/name.ts}, which is
 * duplicated verbatim between bodhassess-app and bodhassess-portal. Change one,
 * change all three.
 */
public final class NameRules {

    /** The {@code name} column on both profile tables is varchar(255). */
    public static final int MAX_LENGTH = 255;

    public static final String TOO_LONG_MESSAGE =
            "Name cannot be longer than " + MAX_LENGTH + " characters";

    public static final String NO_LETTER_MESSAGE = "Name must contain at least one letter";

    /** What every refusal ends with, so the person knows what IS allowed. */
    static final String ALLOWED_SUFFIX =
            " — only letters, spaces, apostrophes ('), hyphens (-) and full stops (.) are allowed";

    /** Beyond this, the list ends in "or others" rather than growing. */
    static final int MAX_LISTED = 5;

    /** Punctuation a name may carry besides letters and marks. */
    private static final String ALLOWED_PUNCTUATION = " .'’-‌‍";

    /**
     * Null when the name's characters are acceptable, otherwise the message to
     * show. Checked on the TRIMMED value, which is what every writer stores.
     * Blank is also null — whether a name is required is {@code @NotBlank}'s
     * question, and answering it twice would give one field two messages.
     */
    public static String characterProblem(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        String trimmed = name.trim();
        // Descriptions, not characters: two different invisible characters
        // both read "an invisible character" and should be named once.
        Set<String> refused = new LinkedHashSet<>();
        boolean hasLetter = false;
        for (int cp : trimmed.codePoints().toArray()) {
            if (Character.isLetter(cp)) {
                hasLetter = true;
            } else if (!isMark(cp) && ALLOWED_PUNCTUATION.indexOf(cp) < 0) {
                refused.add(describe(cp));
            }
        }
        if (!refused.isEmpty()) {
            return "Name cannot contain " + listed(new ArrayList<>(refused)) + ALLOWED_SUFFIX;
        }
        return hasLetter ? null : NO_LETTER_MESSAGE;
    }

    private static boolean isMark(int cp) {
        int type = Character.getType(cp);
        return type == Character.NON_SPACING_MARK
                || type == Character.COMBINING_SPACING_MARK
                || type == Character.ENCLOSING_MARK;
    }

    /**
     * A refused character as the message names it. Quoting a tab or a
     * non-breaking space would print an empty-looking pair of quotes, so those
     * are named in words — a line break is what an Alt+Enter in a sheet cell
     * leaves behind.
     */
    private static String describe(int cp) {
        if (cp == '\t') {
            return "a tab";
        }
        if (cp == '\n' || cp == '\r') {
            return "a line break";
        }
        int type = Character.getType(cp);
        if (Character.isSpaceChar(cp)
                || type == Character.CONTROL
                || type == Character.FORMAT
                || type == Character.SURROGATE
                || type == Character.PRIVATE_USE
                || type == Character.UNASSIGNED) {
            return "an invisible character";
        }
        return "\"" + new String(Character.toChars(cp)) + "\"";
    }

    /** "A", "A or B", "A, B or C", and past {@link #MAX_LISTED} "… or others". */
    private static String listed(List<String> items) {
        List<String> shown = new ArrayList<>(items.subList(0, Math.min(items.size(), MAX_LISTED)));
        if (items.size() > MAX_LISTED) {
            shown.add("others");
        }
        if (shown.size() == 1) {
            return shown.get(0);
        }
        return String.join(", ", shown.subList(0, shown.size() - 1)) + " or " + shown.get(shown.size() - 1);
    }

    private NameRules() {
    }
}
