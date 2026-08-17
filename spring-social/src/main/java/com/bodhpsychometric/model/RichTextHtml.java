package com.bodhpsychometric.model;

import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The one place that decides what markup an author may store in a field the
 * dashboard edits with its rich-text editor and some other app renders as
 * HTML: an assessment's terms &amp; conditions, a questionnaire's general
 * instruction, a section's instruction.
 *
 * <p>Those strings reach respondents' browsers through
 * {@code dangerouslySetInnerHTML}, and the APIs that write them carry no
 * authentication yet — so this is a security control, not a formatting
 * nicety. Rather than clean hostile markup (which needs a real sanitizer
 * library), it REJECTS anything outside a tiny allowlist: the editor emits
 * only these tags, and it emits them without attributes, so anything else is
 * either a bug or an attack and 400 is the right answer to both.
 *
 * <p>The allowlist deliberately excludes every attribute-bearing element —
 * no {@code <a>}, no {@code <img>}, no {@code style} — which is what lets the
 * check be a whitelist of exact tag spellings instead of an attribute parser.
 * If richer formatting is ever needed, add a sanitizer library; do not widen
 * the regex.
 *
 * <p>PLAIN TEXT PASSES. Every instruction stored before the editor existed is
 * unformatted prose, and re-saving it untouched must not 400 — the only thing
 * rejected is a '&lt;' that is not one of the allowed tags. Rendering those
 * legacy values is the clients' job (see {@code toRichHtml} in both
 * frontends): nothing here rewrites stored text.
 */
public final class RichTextHtml {

    private RichTextHtml() {
    }

    /** Tags the editor may produce. No attributes are permitted on any of them. */
    public static final Set<String> ALLOWED_TAGS = Set.of(
            "p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "h2", "h3");

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
     * acceptable HERE — whether blank is allowed depends on the field, so the
     * callers decide that (the terms gate rejects it, an instruction stores
     * null).
     *
     * @param field     the request field name, so the message names what the
     *                  author was editing
     * @param html      the submitted body; null is acceptable ("leave it alone")
     * @param maxLength longest body this field accepts
     */
    public static String validationErrorOf(String field, String html, int maxLength) {
        if (html == null) {
            return null;
        }
        if (html.length() > maxLength) {
            return field + " must be at most " + maxLength + " characters";
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
                    ? field + " contains markup that is not allowed"
                    : field + " contains markup that is not allowed: <" + offender + ">";
        }
        return null;
    }
}
