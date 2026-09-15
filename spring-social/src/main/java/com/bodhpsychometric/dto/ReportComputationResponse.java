package com.bodhpsychometric.dto;

import java.time.OffsetDateTime;
import java.util.List;

import com.bodhpsychometric.model.report.ReportComputation;

/**
 * A computation draft as the assembly screen needs it, plus the assembled
 * prompt and whatever is still missing before it could be sent.
 *
 * <p>{@code artifact} is deliberately absent: no provider has been chosen, so
 * no generated code exists. The response says what WOULD be sent, not what
 * came back.
 */
public record ReportComputationResponse(
        Long reportComputationId,
        String name,
        String slug,
        String description,
        Long assessmentId,
        Long organizationId,
        Long reportTemplateId,
        String templateName,
        String status,
        /** DIRECT or GENERATED — derived from the pinned rules, never asked. */
        String mode,
        /** What DIRECT delivery still needs, in the author's language. Empty = ready. */
        List<String> directBlockers,
        String sourcePrompt,
        String respondentScope,
        List<Long> respondentIds,
        List<SelectedRule> rules,
        List<TagGuidance> tagGuidance,
        PromptPreview prompt,
        /**
         * The template tags a model writes the prose for, in document order.
         *
         * <p>Separate from {@code mode}, and deliberately so: the two answer
         * different questions. {@code mode} says how the NUMBERS are produced —
         * still DIRECT here, because every score comes from a pinned formula.
         * This says whether any TEXT is written by a model. A report can have
         * both, and a screen that collapsed them into one "uses AI" flag would
         * either claim the scores were generated or claim nothing was.
         */
        List<String> narrativeTags,
        /** Whether a model is actually configured to write them. */
        boolean narrativeAvailable,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

    /** One pinned rule version, with enough to render the chip in the UI. */
    public record SelectedRule(
            Long reportRuleVersionId,
            Long reportRuleId,
            String name,
            String slug,
            int version,
            String definitionKind,
            String resultType,
            boolean population,
            List<String> referencedKeys,
            int sortOrder) {
    }

    public record TagGuidance(String tag, String guidance, int sortOrder) {
    }

    /**
     * @param ready    true when nothing blocks sending this to a model
     * @param blockers what is still missing, in the author's language
     */
    public record PromptPreview(
            boolean ready,
            String text,
            List<String> declaredKeys,
            List<String> expectedTags,
            List<String> blockers,
            List<String> warnings) {
    }

    public static String templateNameOf(ReportComputation c) {
        return c.getTemplate() == null ? null : c.getTemplate().getName();
    }
}
