package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create or save a rule. Saving an existing rule writes a NEW immutable
 * version rather than mutating the old one.
 *
 * <p>Which of {@link #expression()} / {@link #statementText()} is required
 * depends on {@link #definitionKind()}, so that check lives in the service:
 * bean validation cannot express it without a class-level constraint whose
 * message would be less useful than the two specific ones the service gives.
 *
 * @param assessmentId the assessment an EXPRESSION is validated against. Required
 *        for EXPRESSION rules — there is no such thing as a column list in the
 *        abstract, and validating against a guess is how a rule ends up valid
 *        everywhere and correct nowhere.
 */
public record ReportRuleRequest(

        @NotBlank(message = "Give the rule a name")
        @Size(max = 160, message = "Name must be 160 characters or fewer")
        String name,

        @Size(max = 80, message = "Reference must be 80 characters or fewer")
        String slug,

        @Size(max = 1000, message = "Description must be 1000 characters or fewer")
        String description,

        @NotBlank(message = "Choose how this rule is defined")
        @Size(max = 16)
        String definitionKind,

        @Size(max = 20_000, message = "Expression is too long")
        String expression,

        @Size(max = 20_000, message = "Statement is too long")
        String statementText,

        @Size(max = 16)
        String resultType,

        Long assessmentId,

        Long organizationId,

        @Size(max = 4000, message = "Notes must be 4000 characters or fewer")
        String notes) {
}
