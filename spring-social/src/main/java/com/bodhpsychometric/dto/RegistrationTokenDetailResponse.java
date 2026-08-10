package com.bodhpsychometric.dto;

import java.util.List;

/**
 * Everything the portal's /register/{token} page needs to draw itself, in one
 * response: who the respondent is registering with (name + logo above the
 * form) and what they will be taking.
 *
 * `assessments` is populated for BOTH scopes so the page has one thing to
 * render — an ASSESSMENT-scoped link sends the single fixed assessment and
 * `assessmentId` set, so the field shows as chosen-and-locked; an
 * ORGANIZATION-scoped link sends the whole ACTIVE catalog with `assessmentId`
 * null, so the same field becomes a dropdown with nothing pre-selected.
 *
 * Carries no token metadata (use count, expiry, status): the page only needs
 * to know the link worked, and publishing how many uses are left to an
 * unauthenticated caller tells them nothing useful and an attacker something.
 */
public record RegistrationTokenDetailResponse(
        String token,
        Scope scope,
        Long organizationId,
        String organizationName,
        String organizationLogoBase64,
        Long assessmentId,
        String assessmentName,
        List<AssessmentOption> assessments) {

    /** Which of the token row's two targets was set. */
    public enum Scope {
        ORGANIZATION,
        ASSESSMENT
    }

    public record AssessmentOption(Long assessmentId, String name) {
    }
}
