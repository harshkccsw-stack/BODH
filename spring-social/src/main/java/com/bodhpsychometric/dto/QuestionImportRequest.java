package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/**
 * Questions and the measured qualities they need, created together or not at
 * all.
 *
 * <h2>Why this exists rather than a sequence of ordinary calls</h2>
 *
 * An imported sheet routinely names qualities the bank does not have yet.
 * Creating those through {@code /api/qualities/create} and
 * {@code /api/quality-types/create} and THEN posting to {@code /bulk-create}
 * is a dozen calls in one logical act: when the last one fails, the taxonomy
 * stays behind, and the retry resolves its own leftovers as though somebody
 * had meant them.
 *
 * <h2>Forward references</h2>
 *
 * A question's score points at a quality type that has no id yet. Rather than
 * a second copy of {@link QuestionRequest} carrying string refs, a pending
 * node is referenced by a <b>negative id</b>: {@code newQualityTypes[i].ref} is
 * a negative number, and the same number appears as a
 * {@code measuredQualityTypeId} inside {@code questions}. Identity ids are
 * always positive, so the two can never be confused, and
 * {@link QuestionRequest} stays exactly as every other caller knows it.
 *
 * <p>A negative id posted to {@code /create} or {@code /bulk-create} instead
 * simply fails to resolve and answers 400 — the sentinel is inert everywhere
 * but here.
 */
public record QuestionImportRequest(
        List<@Valid NewQuality> newQualities,
        List<@Valid NewQualityType> newQualityTypes,
        @NotEmpty(message = "no questions in payload")
        List<@Valid QuestionRequest> questions) {

    /** A measured quality to create. {@code ref} is negative and unique here. */
    public record NewQuality(
            long ref,
            @NotBlank(message = "a new measured quality needs a name")
            @Size(max = 160, message = "a measured quality name is at most 160 characters")
            String name,
            String description) {
    }

    /**
     * A quality type to create. Exactly ONE anchor must be given —
     * {@code qualityRef} or {@code qualityId} for a root, {@code parentTypeRef}
     * or {@code parentTypeId} for a child. That mirrors the two anchors
     * {@code /api/quality-types/create} already takes, each with a pending twin.
     */
    public record NewQualityType(
            long ref,
            @NotBlank(message = "a new quality type needs a name")
            @Size(max = 160, message = "a quality type name is at most 160 characters")
            String name,
            Long qualityRef,
            Long qualityId,
            Long parentTypeRef,
            Long parentTypeId) {

        public int anchorCount() {
            int n = 0;
            if (qualityRef != null) {
                n++;
            }
            if (qualityId != null) {
                n++;
            }
            if (parentTypeRef != null) {
                n++;
            }
            if (parentTypeId != null) {
                n++;
            }
            return n;
        }
    }
}
