package com.bodhpsychometric.service.question;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import com.bodhpsychometric.repository.question.QuestionRepository;

/**
 * "Is this question already in the bank?" — the ONE rule, for both upload
 * routes: the AI mapper's duplicate warning and the template upload's.
 *
 * <p>A warning, never a refusal: a new instrument may legitimately reuse a
 * standard item. What it catches is the same sheet uploaded twice, which
 * otherwise leaves two independent copies of every question in the bank.
 *
 * <p>Two passes. EXACT is the stem as written, trimmed. NORMALISED ignores
 * case, punctuation, runs of spaces and a leading item number ("1.", "(2)",
 * "Q3:") — so a sheet that numbers its stems still matches the bank copy that
 * does not, whichever of the two was uploaded first.
 */
public final class StemMatcher {

    private StemMatcher() {
    }

    /**
     * A leading item number, as sheets write them: "1. ", "12) ", "(3) ",
     * "Q4: ", "1.) ". Requires whitespace after the mark, so "2.5 hours" and
     * "1-2 times" keep their digits. Mirrors LEADING_ITEM_NUMBER in the
     * dashboard's question-sheet-rules.ts.
     */
    public static final Pattern LEADING_ITEM_NUMBER =
            Pattern.compile("^\\s*(?:q\\s*)?\\(?\\d{1,3}\\s*[.):]\\)?\\s+", Pattern.CASE_INSENSITIVE);

    /** One stem found in the bank: which position of the input, which question, and how. */
    public record Match(int index, long existingQuestionId, String method) {
    }

    /**
     * Every input stem that is already in the bank, by its position in
     * {@code stems}. The first question holding a given stem wins, so the
     * answer is stable across calls.
     */
    public static List<Match> findExisting(List<String> stems, List<QuestionRepository.StemOnly> bank) {
        List<Match> out = new ArrayList<>();
        if (stems == null || stems.isEmpty()) {
            return out;
        }
        Map<String, Long> exact = new LinkedHashMap<>();
        Map<String, Long> loose = new LinkedHashMap<>();
        for (QuestionRepository.StemOnly existing : bank) {
            if (existing.getStem() == null) {
                continue;
            }
            exact.putIfAbsent(existing.getStem().trim(), existing.getId());
            loose.putIfAbsent(normalise(existing.getStem()), existing.getId());
        }
        for (int i = 0; i < stems.size(); i++) {
            String stem = stems.get(i) == null ? "" : stems.get(i).trim();
            if (stem.isEmpty()) {
                continue;
            }
            Long hit = exact.get(stem);
            String method = "EXACT";
            if (hit == null) {
                hit = loose.get(normalise(stem));
                method = "NORMALISED";
            }
            if (hit != null) {
                out.add(new Match(i, hit, method));
            }
        }
        return out;
    }

    static String normalise(String s) {
        if (s == null) {
            return "";
        }
        String unnumbered = LEADING_ITEM_NUMBER.matcher(s).replaceFirst("");
        return unnumbered.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[\\p{Punct}\\u2018\\u2019\\u201c\\u201d]", "")
                .replaceAll("\\s+", " ")
                .trim();
    }
}
