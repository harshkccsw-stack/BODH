package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.model.auth.enums.Gender;
import com.fasterxml.jackson.annotation.JsonFormat;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * Create/update payload for a respondent. One request feeds two rows: the
 * User identity (email + dob — dob is the login credential) and the
 * RespondentUser profile (name, phone, gender, consent, organization).
 *
 * dob travels as dd-MM-yyyy on the wire (product decision) — the entity
 * still stores a real LocalDate.
 */
public record RespondentRequest(
        @NotBlank(message = "Name is required") String name,
        @NotBlank(message = "Email is required") @Email(message = "Email must be a valid address") String email,
        @NotNull(message = "Date of birth is required")
        @JsonFormat(pattern = "dd-MM-yyyy") LocalDate dob,
        String phone,
        Gender gender,
        boolean isConsented,
        Long organizationId) {
}
