package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotNull;

/**
 * Ask the model to turn plain-language rules into formulae.
 *
 * <p>{@code ruleIds} is a batch and not one rule at a time on purpose: the
 * rules of a workbook reference each other — {@code AD_composite = ID_score +
 * ST_score + AE_score} is meaningless without the three rules that define those
 * names — so a per-rule call would ask the model to translate a sentence with
 * half its vocabulary missing.
 *
 * @param assessmentId which assessment's columns the formulae may use. Required:
 *        column keys differ per assessment, and a formula checked against the
 *        wrong ones is valid everywhere and correct nowhere.
 */
public record RuleTranslationRequest(

        @NotNull(message = "Choose which assessment these rules belong to")
        Long assessmentId,

        Long organizationId,

        @NotNull(message = "Choose at least one rule to translate")
        List<Long> ruleIds) {
}
