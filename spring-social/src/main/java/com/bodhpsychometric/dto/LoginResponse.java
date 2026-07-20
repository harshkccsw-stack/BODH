package com.bodhpsychometric.dto;

/** Successful login: a bearer token plus the identity the dashboard renders. */
public record LoginResponse(
        String token,
        AuthUserResponse user) {
}
