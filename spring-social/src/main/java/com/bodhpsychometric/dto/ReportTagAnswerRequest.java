package com.bodhpsychometric.dto;

import jakarta.validation.constraints.Size;

/**
 * Answer one placeholder ON THE COMPUTATION.
 *
 * <p>The template says only what SHAPE a tag has — a value or a paragraph.
 * Which rule fills a value, and what a paragraph should say, is this
 * assessment's business and lives here, so one published template serves any
 * number of assessments.
 *
 * @param ruleSlug     VALUE tags: the pinned rule whose result prints here
 * @param guidance     NARRATIVE tags: what the paragraph should say
 * @param format       optional {@code DecimalFormat} pattern for a number
 * @param fallbackText printed when the value is empty
 */
public record ReportTagAnswerRequest(
        @Size(max = 80) String ruleSlug,
        @Size(max = 10_000, message = "Guidance for a tag is too long") String guidance,
        @Size(max = 40) String format,
        @Size(max = 255) String fallbackText) {
}
