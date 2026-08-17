package com.bodhpsychometric.model.assessment;

import java.util.Set;

import com.bodhpsychometric.model.RichTextHtml;

/**
 * The consent text an assessment shows before its first question: the default
 * body, and this field's slice of the shared markup rules.
 *
 * <p>The allowlist itself, and the reasoning behind rejecting rather than
 * sanitizing, now live in {@link RichTextHtml} — questionnaire and section
 * instructions are authored with the same editor and validated by the same
 * rules. What stays here is what is specific to consent text: the wording
 * shown to assessments that never set their own, and the cap.
 */
public final class AssessmentTerms {

    private AssessmentTerms() {
    }

    /** Tags the editor may produce. No attributes are permitted on any of them. */
    public static final Set<String> ALLOWED_TAGS = RichTextHtml.ALLOWED_TAGS;

    /** Longest body accepted, matching the @Size cap on AssessmentRequest. */
    public static final int MAX_LENGTH = 20_000;

    /**
     * Shown when an assessment has no terms of its own — every assessment
     * created before this field existed, which is why readers must call
     * {@link #effective(String)} rather than the getter.
     */
    public static final String DEFAULT_HTML = """
            <p>This assessment is administered by your organization or practitioner through BodhAssess.</p>
            <p>By continuing you confirm that:</p>
            <ul><li>You are taking this assessment yourself, in one sitting, without assistance.</li>\
            <li>Your answers will be recorded and shared with the administrator who assigned this assessment to you.</li>\
            <li>Your responses will be used for assessment and interpretation purposes only.</li></ul>\
            <p>Answer honestly — there are no right or wrong answers unless stated otherwise in the instructions.</p>""";

    /** True when the body carries no visible text — "", "<p><br></p>", "&nbsp;". */
    public static boolean isBlank(String html) {
        return RichTextHtml.isBlank(html);
    }

    /**
     * Why this body cannot be stored, or null when it is acceptable. Blank is
     * acceptable HERE — whether blank is allowed depends on the terms toggle,
     * which the controller checks.
     */
    public static String validationErrorOf(String html) {
        return RichTextHtml.validationErrorOf("termsAndConditions", html, MAX_LENGTH);
    }

    /** The body to render: the author's, or the default when they have none. */
    public static String effective(String stored) {
        return isBlank(stored) ? DEFAULT_HTML : stored;
    }
}
