package com.bodhpsychometric.dto;

import com.bodhpsychometric.service.question.StemMatcher;

/**
 * One uploaded stem that is already in the question bank. {@code index} is its
 * position in the request, which the upload maps back to a sheet row.
 * {@code method} is EXACT or NORMALISED (case, punctuation and a leading item
 * number ignored) — see {@link StemMatcher}.
 */
public record ExistingStemResponse(int index, long existingQuestionId, String method) {

    public static ExistingStemResponse from(StemMatcher.Match match) {
        return new ExistingStemResponse(match.index(), match.existingQuestionId(), match.method());
    }
}
