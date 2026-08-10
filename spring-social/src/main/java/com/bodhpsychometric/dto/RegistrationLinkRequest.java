package com.bodhpsychometric.dto;

import java.time.OffsetDateTime;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Mint a link. The organization is always required; `assessmentId` is what
 * chooses the scope — null mints the org-wide link, an id mints one for that
 * catalog entry (and 400s if the assessment is not in this org's catalog).
 *
 * The two limits are optional and both mean "no limit" when null. They are
 * accepted here rather than added later so the API is complete the day the
 * dashboard wants to expose them; today it sends neither.
 */
public record RegistrationLinkRequest(
        @NotNull(message = "organizationId is required") Long organizationId,
        Long assessmentId,
        @Min(value = 1, message = "maxUses must be at least 1") Integer maxUses,
        OffsetDateTime expiresAt) {
}
