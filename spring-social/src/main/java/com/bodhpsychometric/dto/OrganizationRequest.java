package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create/update payload for an organization. Membership is NOT set here —
 * staff (practitioners) and members (respondents) attach themselves through
 * their own pages' organization picker.
 */
public record OrganizationRequest(
        @NotBlank(message = "Name is required")
        @Size(max = 200, message = "Name must be at most 200 characters") String name,
        @Size(max = 200, message = "Email must be at most 200 characters") String orgEmail,
        String description) {
}
