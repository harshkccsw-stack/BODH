package com.bodhpsychometric.model.question;

import com.bodhpsychometric.model.question.enums.SelectionRule;

/**
 * How many options one question accepts: at least {@code floor}, at most
 * {@code cap}. THE one place a (rule, count) pair becomes two numbers —
 * author-time validation, the portal's submit gate and the delivery DTO all
 * read it, so "what MAX means" is decided once.
 *
 * <pre>
 * rule       floor  cap
 * ────────────────────────────
 * null (1)      1    1     single choice — every question before this existed
 * EQUALS n      n    n
 * MAX n         1    n
 * MIN n         n    optionCount
 * </pre>
 *
 * The floor is never 0: every placed question stays mandatory, so "up to 3"
 * means 1—3. Optional questions would be a separate feature.
 */
public record SelectionBounds(int floor, int cap) {

    /**
     * A null rule, or a rule whose count never made it (older rows, a payload
     * that skipped validation), is single choice — the safe reading, and the
     * one that matches what the column defaults to.
     */
    public static SelectionBounds of(SelectionRule rule, Integer count, int optionCount) {
        if (rule == null || count == null) {
            return new SelectionBounds(1, 1);
        }
        return switch (rule) {
            case EQUALS -> new SelectionBounds(count, count);
            case MAX -> new SelectionBounds(1, count);
            // Guard the cap against a count that outgrew the option list:
            // validation blocks that, but an inverted range here would reject
            // every possible answer instead of just being pointless.
            case MIN -> new SelectionBounds(count, Math.max(count, optionCount));
        };
    }

    public static SelectionBounds of(Question question) {
        return of(question.getSelectionRule(), question.getSelectionCount(), question.getOptions().size());
    }

    public boolean allows(int selectedCount) {
        return selectedCount >= floor && selectedCount <= cap;
    }
}
