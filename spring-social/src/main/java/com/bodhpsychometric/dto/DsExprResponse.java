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
 */
public record DsExprResponse(
        boolean ok,
        String evalTarget,
        String resultType,
        List<String> errors,
        List<String> referencedColumns,
        List<String> functions) {
}
