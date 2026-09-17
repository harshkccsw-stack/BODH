package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

/**
 * Finds the {@code ${tag}} placeholders in a template's HTML.
 *
 * <p>The grammar is deliberately closed and boring: a tag is
 * {@code ${} then letters, digits, underscore, dot or hyphen, then {@code }}.
 * No expressions, no nesting, no function calls. A template is authored HTML
 * that gets rendered server-side, so every construct the syntax admits is a
 * construct somebody could smuggle something through; the way to keep that
 * small is to keep the grammar small.
 *
 * <p>Order is document order of FIRST occurrence, and duplicates collapse. A
 * tag used three times on the page is one checklist item, answered once and
 * substituted everywhere — which is what makes the save-time reconcile an
 * upsert keyed on the tag name.
 *
 * <p>{@code $${notATag}} escapes: a doubled dollar is how a template prints a
 * literal {@code ${...}} without binding it. Rare, but the alternative is that
 * documentation templates about this very feature cannot be written.
 */
@Component
public class TemplateTagParser {

    /**
     * {@code (?<!\$)} so the second {@code $} of an escaped {@code $${...}}
     * does not start a match.
     */
    private static final Pattern TAG = Pattern.compile("(?<!\\$)\\$\\{([A-Za-z0-9_.-]{1,80})\\}");

    /** Longest a tag name may be — matches the column width. */
    public static final int MAX_TAG_LENGTH = 80;

    /**
     * Tag names in document order of first occurrence, deduplicated.
     * Never null; an empty list is a normal answer for a template that is all
     * fixed layout.
     */
    public List<String> parse(String html) {
        if (html == null || html.isBlank()) {
            return List.of();
        }
        LinkedHashSet<String> found = new LinkedHashSet<>();
        Matcher m = TAG.matcher(html);
        while (m.find()) {
            found.add(m.group(1));
        }
        return new ArrayList<>(found);
    }

    /**
     * Replace every {@code ${tag}} with its resolved value, and turn an
     * escaped {@code $${x}} back into a literal {@code ${x}}.
     *
     * <p>Values are substituted through {@code Matcher.quoteReplacement} so a
     * respondent whose name contains {@code $} or {@code \} cannot corrupt the
     * output — a real case, not a theoretical one.
     *
     * <p>A tag with no entry in {@code values} renders as empty rather than
     * leaving {@code ${tag}} visible in a delivered document. Rendering is
     * gated on a published template where every tag is bound, so reaching this
     * means a bug upstream; printing the placeholder to a client is the worse
     * of the two failures.
     */
    public String substitute(String html, java.util.Map<String, String> values) {
        if (html == null || html.isBlank()) {
            return html;
        }
        Matcher m = TAG.matcher(html);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String value = values.get(m.group(1));
            m.appendReplacement(out, Matcher.quoteReplacement(value == null ? "" : value));
        }
        m.appendTail(out);
        return out.toString().replace("$${", "${");
    }
}
