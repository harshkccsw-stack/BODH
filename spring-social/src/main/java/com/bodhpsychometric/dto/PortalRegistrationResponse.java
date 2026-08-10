package com.bodhpsychometric.dto;

/**
 * Successful self-registration. Carries the same {token, respondent} pair as
 * {@link PortalLoginResponse} — registering IS a sign-in — plus where to send
 * the respondent next, which differs by link scope:
 *
 *   - assessment-scoped → the allotment they just received, so the portal can
 *     open /portal/assessment/{id} directly. They have exactly one thing to
 *     do; making them pick it off a list of one is a wasted step.
 *   - org-wide → null. Joining an organization allots nothing, so there is
 *     nothing to open and the portal lands on the dashboard, whose empty state
 *     already explains that an administrator will assign something.
 */
public record PortalRegistrationResponse(
        String token,
        PortalAuthResponse respondent,
        Long respondentAssessmentMappingId) {
}
