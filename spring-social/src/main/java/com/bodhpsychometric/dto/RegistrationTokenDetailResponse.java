package com.bodhpsychometric.dto;

/**
 * Everything the portal's /register/{token} page needs to draw itself, in one
 * response: who the respondent is registering with (name + logo above the
 * form) and, on an assessment-scoped link, what they will be taking.
 *
 * The assessment fields are set for ASSESSMENT scope and null for ORGANIZATION
 * scope, which is the whole difference between the two forms: an
 * assessment-scoped link shows the assessment as chosen-and-locked, an
 * org-wide link shows no assessment field at all because joining an
 * organization grants none — an administrator assigns afterwards.
 *
 * There is deliberately no list of the organization's assessments. Nothing on
 * the form picks one any more, so sending the catalog would only publish the
 * organization's assessment names to anyone holding a link.
 *
 * Carries no token metadata (use count, expiry, status) either: the page only
 * needs to know the link worked, and publishing how many uses are left to an
 * unauthenticated caller tells them nothing useful and an attacker something.
 */
public record RegistrationTokenDetailResponse(
        String token,
        Scope scope,
        Long organizationId,
        String organizationName,
        String organizationLogoBase64,
        Long assessmentId,
        String assessmentName) {

    /** Which of the token row's two targets was set. */
    public enum Scope {
        ORGANIZATION,
        ASSESSMENT
    }
}
