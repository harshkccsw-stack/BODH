package com.bodhpsychometric.dto;

/** Successful portal login: a bearer token plus the respondent the portal renders. */
public record PortalLoginResponse(
        String token,
        PortalAuthResponse respondent) {
}
