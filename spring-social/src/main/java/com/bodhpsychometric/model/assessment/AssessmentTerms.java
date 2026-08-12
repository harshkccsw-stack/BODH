package com.bodhpsychometric.model.assessment;

import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The consent text an assessment shows before its first question: the default
 * body, and the rules for what markup an author may store.
 *
 * <p>This text is authored in the dashboard and rendered as HTML into every
 * respondent's browser, so it is an injection target — and
 * {@code /api/assessments} carries no authentication yet. Rather than clean
 * hostile markup (which needs a real sanitizer library), this class REJECTS
 * anything outside a tiny allowlist: the dashboard's editor emits only these
 * tags, and it emits them without attributes, so anything else is either a
 * bug or an attack and 400 is the right answer to both.
 *
 * <p>The allowlist deliberately excludes every attribute-bearing element —
 * no {@code <a>}, no {@code <img>}, no {@code style} — which is what lets the
 * check be a whitelist of exact tag spellings instead of an attribute parser.
 * If richer formatting is ever needed, add a sanitizer library; do not widen
 * the regex.
 */
public final class AssessmentTerms {

    private AssessmentTerms() {
    }

    /** Tags the editor may produce. No attributes are permitted on any of them. */
    public static final Set<String> ALLOWED_TAGS = Set.of(
            "p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h2", "h3");

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

    // An allowed tag, exactly: optional slash, a name from the list, an
    // optional self-closing slash. No whitespace-separated attributes can
    // match, so <p onclick=...> survives the strip and trips the '<' check.
    private static final Pattern ALLOWED_TAG = Pattern.compile(
            "</?(" + String.join("|", ALLOWED_TAGS) + ")\\s*/?>",
            Pattern.CASE_INSENSITIVE);

    // What is left once tags and entities go: real words, or nothing.
    private static final Pattern ENTITY = Pattern.compile("&[a-zA-Z]+;|&#\\d+;");

    /** True when the body carries no visible text — "", "<p><br></p>", "&nbsp;". */
    public static boolean isBlank(String html) {
        if (html == null) {
            return true;
        }
        String text = ALLOWED_TAG.matcher(html).replaceAll("");
        text = ENTITY.matcher(text).replaceAll(" ");
        return text.isBlank();
    }

    /**
     * Why this body cannot be stored, or null when it is acceptable. Blank is
     * acceptable HERE — whether blank is allowed depends on the terms toggle,
     * which the controller checks.
     */
    public static String validationErrorOf(String html) {
        if (html == null) {
            return null;
        }
        if (html.length() > MAX_LENGTH) {
            return "termsAndConditions must be at most " + MAX_LENGTH + " characters";
        }
        String stripped = ALLOWED_TAG.matcher(html).replaceAll("");
        // A '<' that survived the strip is markup we do not allow. A stray
        // '>' is not: browsers render it as text, and authors type it ("5 >
        // 3") — the editor escapes every '<' they type as &lt;, so anything
        // left here came from somewhere else.
        if (stripped.indexOf('<') >= 0) {
            Matcher m = Pattern.compile("<\\s*/?\\s*([a-zA-Z0-9]+)").matcher(stripped);
            String offender = m.find() ? m.group(1).toLowerCase() : "";
            return offender.isEmpty()
                    ? "termsAndConditions contains markup that is not allowed"
                    : "termsAndConditions contains markup that is not allowed: <" + offender + ">";
        }
        return null;
    }

    /** The body to render: the author's, or the default when they have none. */
    public static String effective(String stored) {
        return isBlank(stored) ? DEFAULT_HTML : stored;
    }
}
