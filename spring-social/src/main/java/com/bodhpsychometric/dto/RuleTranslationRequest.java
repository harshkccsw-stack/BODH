package com.bodhpsychometric.dto;

import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.NotNull;

/**
 * Ask the model to turn plain-language rules into formulae.
 *
 * <p>{@code ruleIds} is a batch and not one rule at a time on purpose: the
 * rules of a workbook reference each other — {@code AD_composite = ID_score +
 * ST_score + AE_score} is meaningless without the three rules that define those
 * names — so a per-rule call would ask the model to translate a sentence with
 * half its vocabulary missing. A single-rule re-ask therefore carries
 * {@code context}: the batch's current draft formulae, so the vocabulary is
 * still whole.
 *
 * @param assessmentId which assessment's columns the formulae may use. Required:
 *        column keys differ per assessment, and a formula checked against the
 *        wrong ones is valid everywhere and correct nowhere.
 * @param hints the reviewer's own words per rule id — "the composite is
 *        [rule:ad-composite], not [mq:7]". Shown to the model beside its
 *        previous attempt with the instruction to change only what was named.
 * @param context draft formulae already proposed in this batch, by slug. They
 *        count as formulae for validation (a proposal may read them) and are
 *        shown to the model so it references them rather than rebuilding them.
 */
public record RuleTranslationRequest(

        @NotNull(message = "Choose which assessment these rules belong to")
        Long assessmentId,

        Long organizationId,

        @NotNull(message = "Choose at least one rule to translate")
        List<Long> ruleIds,

        Map<Long, String> hints,

        List<Draft> context) {

    /** One draft formula the reviewer is holding but has not saved. */
    public record Draft(String slug, String expression) {
    }

    public Map<Long, String> hintsOrEmpty() {
        return hints == null ? Map.of() : hints;
    }

    public List<Draft> contextOrEmpty() {
        return context == null ? List.of() : context;
    }
}
