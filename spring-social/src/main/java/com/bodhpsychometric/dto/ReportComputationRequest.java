package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Create or save a computation draft.
 *
 * @param ruleVersionIds the EXACT rule versions this computation uses. Version
 *        ids, not rule ids: pinning is what stops a later rule edit changing
 *        what an approved computation meant.
 * @param tagGuidance    per-tag instructions tying rules to specific ${tags}.
 *        Replace-all on save, like the questionnaire demographic mapping.
 */
public record ReportComputationRequest(

        @NotBlank(message = "Give this computation a name")
        @Size(max = 160, message = "Name must be 160 characters or fewer")
        String name,

        @Size(max = 80)
        String slug,

        @Size(max = 1000, message = "Description must be 1000 characters or fewer")
        String description,

        @NotNull(message = "Choose the assessment this computation runs on")
        Long assessmentId,

        Long organizationId,

        Long reportTemplateId,

        @Size(max = 50_000, message = "Guidance prompt is too long")
        String sourcePrompt,

        @Size(max = 16)
        String respondentScope,

        List<Long> respondentIds,

        List<Long> ruleVersionIds,

        List<TagGuidance> tagGuidance) {

    public record TagGuidance(
            @Size(max = 80) String tag,
            @Size(max = 10_000, message = "Guidance for a tag is too long") String guidance) {
    }
}
