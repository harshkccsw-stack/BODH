package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.organization.enums.RegistrationTokenStatus;

import jakarta.validation.constraints.NotNull;

/**
 * Pause or resume a link without destroying it — the difference between "stop
 * accepting registrations for now" and "this URL is compromised", which is
 * what rotate and delete are for.
 */
public record RegistrationLinkStatusRequest(
        @NotNull(message = "status is required") RegistrationTokenStatus status) {
}
