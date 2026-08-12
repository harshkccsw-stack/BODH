package com.bodhpsychometric.model.question.enums;

/**
 * How many of a question's options the respondent may pick, read together
 * with the question's selectionCount: MIN = at least n, MAX = up to n,
 * EQUALS = exactly n.
 *
 * A question with NO rule (null) is single choice — one option, which is what
 * every question meant before this existed. The rule and the count are always
 * set or cleared together; see {@link com.bodhpsychometric.model.question.SelectionBounds},
 * which is the only place the three values are turned into a floor and a cap.
 */
public enum SelectionRule {
    MIN,
    MAX,
    EQUALS
}
