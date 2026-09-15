package com.bodhpsychometric.dto;

import java.util.List;

/**
 * What the parser made of a formula. Never an error response — a broken
 * formula is a normal thing to be halfway through typing, so problems come
 * back in {@code errors} with HTTP 200 and the editor shows them live.
 *
 * <p>{@code evalTarget} is the INFERRED class: CLIENT while the formula only
 * touches the current row, SERVER as soon as it uses a population function
 * (ZSCORE, PERCENTILE, RANK, AVERAGE, …) that needs every row to answer.
 *
 * <p>{@code warnings} are the opposite of {@code errors}: the formula is
 * correct as a formula and suspect as psychometrics — a band cut no respondent
 * can reach, say. They never make {@code ok} false, because refusing to save
 * one would be the checker overruling an author about their own instrument.
 * They exist because {@code ok} is a low bar: everything this product got
 * wrong so far parsed perfectly.
 */
public record DsExprResponse(
        boolean ok,
        String evalTarget,
        String resultType,
        List<String> errors,
        List<String> referencedColumns,
        List<String> functions,
        List<String> warnings) {

    /** The common case: nothing to warn about. */
    public DsExprResponse(boolean ok, String evalTarget, String resultType,
            List<String> errors, List<String> referencedColumns, List<String> functions) {
        this(ok, evalTarget, resultType, errors, referencedColumns, functions, List.of());
    }

    public DsExprResponse withWarnings(List<String> warnings) {
        return new DsExprResponse(ok, evalTarget, resultType, errors,
                referencedColumns, functions, List.copyOf(warnings));
    }
}
