package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create/update payload for an organization. Membership is NOT set here —
 * staff (practitioners) and members (respondents) attach themselves through
 * their own pages' organization picker. assessmentIds is only read on
 * CREATE (initial catalog); afterwards the catalog is managed through the
 * assign-assessments / unassign-assessments endpoints.
 */
public record OrganizationRequest(
        @NotBlank(message = "Name is required")
        @Size(max = 200, message = "Name must be at most 200 characters") String name,
        @Size(max = 200, message = "Email must be at most 200 characters") String orgEmail,
        String description,
        // Logo as a base64 data URL ("data:image/png;base64,…"), or null to
        // clear it. Capped at ~3 MB of characters (≈2 MB image once base64
        // inflates it) so one upload can't bloat the row; the form should
        // also reject oversized files before they reach here.
        @Size(max = 3_000_000, message = "Logo image is too large — use one under 2 MB") String logoBase64,
        // The co-branding logo shown in the portal header while a respondent
        // takes an assessment, same encoding and same cap as the logo above,
        // and equally optional — null means the portal shows its own mark.
        @Size(max = 3_000_000, message = "Assessment logo is too large — use one under 2 MB")
        String coBrandLogoBase64,
        List<Long> assessmentIds) {
}
