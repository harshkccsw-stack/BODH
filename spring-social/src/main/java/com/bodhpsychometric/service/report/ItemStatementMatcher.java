package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import com.bodhpsychometric.model.report.ReportItemBinding;

/**
 * Matching the sheet's item statements to the questionnaire's question stems.
 *
 * <h2>Why the statement and not the position</h2>
 *
 * The obvious join is {@code Admin_Position} → the placement's {@code sortOrder},
 * and it is wrong. Placement order changes — questions get unplaced, sections
 * get reordered, {@code questionTag} is regenerated wholesale on every
 * placement save. A binding built on position survives until the first reorder
 * and then silently points every item-level rule at a different item. Nothing
 * downstream can tell; the reports simply become wrong.
 *
 * <p>The statement is the one field both sides hold verbatim, so it is the
 * join. Position appears here only as a tiebreaker between two candidates that
 * already matched on text.
 *
 * <h2>Tiered and greedy, which is what stops double-claiming</h2>
 *
 * All exact matches are taken first, across every item; then normalised
 * matches over what is left; then fuzzy. A question already claimed by an exact
 * match is out of the running for everything below it.
 *
 * <p>That ordering is doing real work. Two items whose statements differ only
 * in punctuation would, matched item-by-item, both reach for the same question
 * and one would win on row order. Claiming the exact match first leaves the
 * second item to match its own question or to fail honestly — and failing
 * honestly is the point: an unresolved item is visible and one click to fix,
 * whereas a confidently wrong one is neither.
 *
 * <p>Pure and static: no repositories, no entities beyond the candidate record,
 * so the matching rules can be tested against the real workbook without a
 * database.
 */
public final class ItemStatementMatcher {

    private ItemStatementMatcher() {
    }

    /** One placed question, as matching needs it. */
    public record Candidate(Long questionId, Long questionnaireQuestionId, String questionTag,
            int sortOrder, String stem) {
    }

    /**
     * @param method one of {@link ReportItemBinding}'s MATCH_* constants
     * @param note   why it failed or what was uncertain, for the reviewer
     */
    public record Match(Candidate candidate, String method, String note) {

        public boolean isResolved() {
            return candidate != null;
        }
    }

    /**
     * Anything below this and two unrelated statements start matching on
     * nothing but their shared function words. Deliberately high: a fuzzy match
     * is a suggestion a human must look at, so a miss costs one manual pick
     * while a false match costs a wrong report.
     */
    private static final double FUZZY_FLOOR = 0.75;

    /**
     * Match every statement, in tiers.
     *
     * @param statements   item code → the sheet's statement, in sheet order
     * @param candidates   the questionnaire's placed questions
     * @param manual       item code → questionId a human chose; these are
     *                     honoured first and claim their question outright
     * @return item code → what it matched, every input code present
     */
    public static Map<String, Match> matchAll(Map<String, String> statements,
            List<Candidate> candidates, Map<String, Long> manual) {

        Map<String, Match> out = new LinkedHashMap<>();
        Set<Long> claimed = new HashSet<>();
        Map<Long, Candidate> byQuestionId = new LinkedHashMap<>();
        for (Candidate candidate : candidates) {
            byQuestionId.put(candidate.questionId(), candidate);
        }

        // ── tier 0: what a person chose, which beats every rule here ───────
        for (Map.Entry<String, String> entry : statements.entrySet()) {
            Long chosen = manual == null ? null : manual.get(entry.getKey());
            if (chosen == null) {
                continue;
            }
            Candidate candidate = byQuestionId.get(chosen);
            if (candidate == null) {
                out.put(entry.getKey(), new Match(null, ReportItemBinding.MATCH_NONE,
                        "The question chosen for this item is not placed in this "
                                + "assessment's questionnaire."));
                continue;
            }
            if (!claimed.add(chosen)) {
                out.put(entry.getKey(), new Match(null, ReportItemBinding.MATCH_NONE,
                        "That question is already bound to another item."));
                continue;
            }
            out.put(entry.getKey(), new Match(candidate, ReportItemBinding.MATCH_MANUAL, null));
        }

        // ── tiers 1-3: exact, then normalised, then fuzzy ──────────────────
        claimTier(statements, candidates, out, claimed,
                ItemStatementMatcher::exactKey, ReportItemBinding.MATCH_EXACT);
        claimTier(statements, candidates, out, claimed,
                ItemStatementMatcher::normalise, ReportItemBinding.MATCH_NORMALISED);
        claimFuzzy(statements, candidates, out, claimed);

        for (String code : statements.keySet()) {
            out.putIfAbsent(code, new Match(null, ReportItemBinding.MATCH_NONE,
                    "No question in this questionnaire has a matching statement."));
        }
        return out;
    }

    /**
     * One exact-key tier. A key shared by two unclaimed questions resolves
     * NEITHER — an ambiguous match is a question for the reviewer, and picking
     * the first is how a binding becomes quietly wrong.
     */
    private static void claimTier(Map<String, String> statements, List<Candidate> candidates,
            Map<String, Match> out, Set<Long> claimed,
            java.util.function.Function<String, String> key, String method) {

        Map<String, List<Candidate>> index = new LinkedHashMap<>();
        for (Candidate candidate : candidates) {
            if (claimed.contains(candidate.questionId())) {
                continue;
            }
            index.computeIfAbsent(key.apply(candidate.stem()), k -> new ArrayList<>())
                    .add(candidate);
        }

        for (Map.Entry<String, String> entry : statements.entrySet()) {
            if (out.containsKey(entry.getKey())) {
                continue;
            }
            List<Candidate> hits = index.get(key.apply(entry.getValue()));
            if (hits == null) {
                continue;
            }
            List<Candidate> free = hits.stream()
                    .filter(c -> !claimed.contains(c.questionId())).toList();
            if (free.isEmpty()) {
                continue;
            }
            if (free.size() > 1) {
                out.put(entry.getKey(), new Match(null, ReportItemBinding.MATCH_NONE,
                        "Two questions in this questionnaire have this same statement, so "
                                + "which one this item means has to be chosen by hand."));
                continue;
            }
            Candidate only = free.get(0);
            claimed.add(only.questionId());
            out.put(entry.getKey(), new Match(only, method, null));
        }
    }

    /**
     * The last tier: best token overlap above {@link #FUZZY_FLOOR}.
     *
     * <p>Scored item by item rather than globally optimised. A global
     * assignment would be better in theory and much harder to explain, and this
     * tier only ever produces a suggestion a human confirms — so an
     * explanation the reviewer can follow is worth more than an optimum they
     * cannot.
     */
    private static void claimFuzzy(Map<String, String> statements, List<Candidate> candidates,
            Map<String, Match> out, Set<Long> claimed) {

        for (Map.Entry<String, String> entry : statements.entrySet()) {
            if (out.containsKey(entry.getKey())) {
                continue;
            }
            Set<String> wanted = tokens(entry.getValue());
            if (wanted.isEmpty()) {
                continue;
            }
            Candidate best = null;
            double bestScore = 0;
            boolean tied = false;

            for (Candidate candidate : candidates) {
                if (claimed.contains(candidate.questionId())) {
                    continue;
                }
                double score = overlap(wanted, tokens(candidate.stem()));
                if (score < FUZZY_FLOOR) {
                    continue;
                }
                if (score > bestScore) {
                    best = candidate;
                    bestScore = score;
                    tied = false;
                } else if (score == bestScore) {
                    tied = true;
                }
            }
            if (best == null) {
                continue;
            }
            if (tied) {
                out.put(entry.getKey(), new Match(null, ReportItemBinding.MATCH_NONE,
                        "Several questions are an equally close match, so this one has to be "
                                + "chosen by hand."));
                continue;
            }
            claimed.add(best.questionId());
            out.put(entry.getKey(), new Match(best, ReportItemBinding.MATCH_FUZZY,
                    "Close but not identical wording (" + Math.round(bestScore * 100)
                            + "% of words shared). Check this one."));
        }
    }

    /* ===================== text ===================== */

    /** Whitespace collapsed and nothing else — the strictest tier. */
    static String exactKey(String text) {
        return strip(text).replaceAll("\\s+", " ").trim();
    }

    /**
     * Case, punctuation and spacing removed. Catches the differences that are
     * always drift rather than meaning: a curly apostrophe, a trailing period,
     * a double space.
     */
    static String normalise(String text) {
        return strip(text).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "");
    }

    /**
     * Stems are stored as rich text, statements are typed into a spreadsheet
     * cell. Without this every single match would fall through to fuzzy the
     * moment a stem carried so much as a {@code <p>}.
     */
    private static String strip(String text) {
        if (text == null) {
            return "";
        }
        return text.replaceAll("<[^>]*>", " ")
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&#39;", "'")
                .replace("‘", "'").replace("’", "'")
                .replace("“", "\"").replace("”", "\"");
    }

    static Set<String> tokens(String text) {
        Set<String> out = new LinkedHashSet<>();
        for (String word : strip(text).toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            if (!word.isEmpty()) {
                out.add(word);
            }
        }
        return out;
    }

    /** Jaccard: shared words over all words used by either. */
    static double overlap(Set<String> a, Set<String> b) {
        if (a.isEmpty() || b.isEmpty()) {
            return 0;
        }
        int shared = 0;
        for (String word : a) {
            if (b.contains(word)) {
                shared++;
            }
        }
        return (double) shared / (a.size() + b.size() - shared);
    }
}
