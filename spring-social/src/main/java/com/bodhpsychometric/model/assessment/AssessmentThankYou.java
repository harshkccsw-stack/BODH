package com.bodhpsychometric.model.assessment;

import com.bodhpsychometric.model.RichTextHtml;

/**
 * The message an assessment shows under "Thank you!" once the respondent has
 * submitted: the default body, and this field's slice of the shared markup
 * rules. Authored with the same editor as the consent text, so the allowlist
 * and the reject-don't-sanitize reasoning are {@link RichTextHtml}'s.
 *
 * <p>The respondent's name is NOT part of the message — the portal prints it
 * on its own line above, so an author never has to know (or template) it.
 */
public final class AssessmentThankYou {

    private AssessmentThankYou() {
    }

    /** Longest body accepted, matching the @Size cap on AssessmentRequest. */
    public static final int MAX_LENGTH = 20_000;

    /**
     * Shown when an assessment has no message of its own — every assessment
     * created before the field existed, and any whose author emptied the
     * editor. Readers call {@link #effective(String)}, never the getter.
     */
    public static final String DEFAULT_HTML = "<p>Your responses have been submitted securely. Your administrator "
            + "will review them and share the report separately.</p>";

    /**
     * Why this body cannot be stored, or null when it is acceptable. Blank is
     * acceptable — it means "use the default", and is stored as NULL.
     */
    public static String validationErrorOf(String html) {
        return RichTextHtml.validationErrorOf("thankYouMessage", html, MAX_LENGTH);
    }

    /** What to store for a submitted body: NULL when it carries no visible text. */
    public static String stored(String html) {
        return RichTextHtml.isBlank(html) ? null : html;
    }

    /** The body to render: the author's, or the default when they have none. */
    public static String effective(String stored) {
        return RichTextHtml.isBlank(stored) ? DEFAULT_HTML : stored;
    }
}
