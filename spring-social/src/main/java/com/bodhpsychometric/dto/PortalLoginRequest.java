package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.fasterxml.jackson.annotation.JsonAlias;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * Portal sign-in credentials: an identifier plus date of birth. The identifier
 * is either an email address or a respondent's employee id — the service picks
 * which by looking for '@', which is unambiguous because employee ids are
 * validated alphanumeric.
 *
 * Deliberately NOT reusing {@link LoginRequest}: that one carries @Email and
 * the dashboard login still wants it. The @JsonAlias keeps already-deployed
 * portal builds working, which post {"email": ...}.
 */
public record PortalLoginRequest(
        @NotBlank(message = "Enter your email or employee id")
        @JsonAlias("email") String identifier,
        @NotNull(message = "Date of birth is required") LocalDate dob) {
}
