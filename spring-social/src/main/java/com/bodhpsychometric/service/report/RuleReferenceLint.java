package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks the guidance prompt against the rules a computation actually selected,
 * in both directions.
 *
 * <p>The prompt's job in §2 is to REFER to rules that §3 states in full, and the
 * slug is the join. Two ways for that join to be wrong, and neither shows up
 * anywhere else:
 *
 * <ul>
 *   <li><b>Named but not selected.</b> "Band using {@code anxiety-composite}"
 *       when that rule is not among the selections. The prompt reads perfectly
 *       and the definition is simply absent from §3 — the model is asked to
 *       apply logic it was never given. This is the failure worth catching.</li>
 *   <li><b>Selected but never named.</b> Usually a leftover tick, or guidance
 *       that covers half the job. Harmless on its own, so it is reported as a
 *       hint rather than a defect.</li>
 * </ul>
 *
 * <h2>The two directions match differently, on purpose</h2>
 *
 * <p><b>A dangling reference accuses the author of a mistake</b>, so it has to
 * be precise: only an explicit <code>`slug`</code> in backticks counts. Prose
 * cannot trip it. Without that rule a one-word slug like {@code extraversion}
 * matches the word "Extraversion" inside the NAME of a different rule — "fill
 * from the Extraversion composite" would be reported as a reference to a rule
 * nobody named. That false positive is much more expensive than the miss it
 * replaces: an author who types a bare slug simply gets no warning, and the
 * insert rail on the computations page writes the backticks anyway.
 *
 * <p><b>"Never named" must not nag</b>, so it is generous: any whole-token
 * mention of the slug OR the rule's name, backticks or not, counts as having
 * referred to it. Being told you did not mention a rule you plainly discussed
 * would just be wrong.
 *
 * <p>Either way, only slugs that exist in the LIBRARY are ever named. A token
 * matching no rule is almost certainly a value the report prints —
 * {@code low}, {@code average} — and a lint that fires on those is one people
 * learn to ignore.
 *
 * <p>Pure and static: the same rules run in the browser as the author types
 * (report-computations.tsx) and here for anything written through the API. Keep
 * the two in step — the browser copy is a convenience, this one is the record.
 */
public final class RuleReferenceLint {

    private RuleReferenceLint() {
    }

    /** One selected rule, as the lint needs it. */
    public record Ref(String slug, String name) {
    }

    /**
     * @param namedButNotSelected slugs of real library rules the prompt refers
     *        to that this computation did not select
     * @param selectedButNotNamed display names of selected rules the prompt
     *        never refers to, by slug or by name
     */
    public record Findings(List<String> namedButNotSelected, List<String> selectedButNotNamed) {

        public boolean isClean() {
            return namedButNotSelected.isEmpty() && selectedButNotNamed.isEmpty();
        }
    }

    private static final Findings CLEAN = new Findings(List.of(), List.of());

    /**
     * Only ever called on a prompt that has content — a blank prompt is already
     * a blocker, and reporting "you named nothing" underneath that is noise.
     */
    public static Findings check(String prompt, List<Ref> selected,
            Collection<String> librarySlugs) {

        if (prompt == null || prompt.isBlank()) {
            return CLEAN;
        }
        String text = prompt.toLowerCase(Locale.ROOT);

        Set<String> selectedSlugs = new LinkedHashSet<>();
        for (Ref ref : selected) {
            if (ref.slug() != null) {
                selectedSlugs.add(ref.slug().toLowerCase(Locale.ROOT));
            }
        }

        Set<String> quoted = backtickedTokens(text);
        List<String> named = new ArrayList<>();
        for (String slug : librarySlugs) {
            if (slug == null || slug.isBlank()) {
                continue;
            }
            String lower = slug.toLowerCase(Locale.ROOT);
            if (!selectedSlugs.contains(lower) && quoted.contains(lower)) {
                named.add(slug);
            }
        }

        List<String> unnamed = new ArrayList<>();
        for (Ref ref : selected) {
            boolean bySlug = ref.slug() != null
                    && mentions(text, ref.slug().toLowerCase(Locale.ROOT));
            // The name counts too: an author who writes "the Extraversion
            // composite" has referred to the rule as plainly as a slug does,
            // and being told otherwise would just be wrong.
            boolean byName = ref.name() != null
                    && mentions(text, ref.name().toLowerCase(Locale.ROOT));
            if (!bySlug && !byName) {
                unnamed.add(ref.name() == null ? ref.slug() : ref.name());
            }
        }

        return named.isEmpty() && unnamed.isEmpty()
                ? CLEAN
                : new Findings(List.copyOf(named), List.copyOf(unnamed));
    }

    /**
     * Every <code>`...`</code> span in the text, lowercased and trimmed. What
     * an author put in backticks is what they meant as an identifier, which is
     * the only signal precise enough to accuse them of naming the wrong rule.
     */
    static Set<String> backtickedTokens(String lowerText) {
        Set<String> out = new LinkedHashSet<>();
        Matcher m = BACKTICKED.matcher(lowerText);
        while (m.find()) {
            String token = m.group(1).trim();
            if (!token.isEmpty()) {
                out.add(token);
            }
        }
        return out;
    }

    private static final Pattern BACKTICKED = Pattern.compile("`([^`\n]+)`");

    /**
     * Whole-token match, used only for the generous direction. The boundary
     * excludes {@code -} as well as letters and digits, because {@code \b}
     * treats a hyphen as a boundary and would find the rule
     * {@code extraversion} inside a mention of {@code extraversion-composite}
     * — reporting a rule as unmentioned because a longer one was.
     */
    static boolean mentions(String lowerText, String lowerToken) {
        if (lowerToken.isBlank()) {
            return false;
        }
        Pattern p = Pattern.compile(
                "(?<![a-z0-9-])" + Pattern.quote(lowerToken) + "(?![a-z0-9-])");
        Matcher m = p.matcher(lowerText);
        return m.find();
    }
}
