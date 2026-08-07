package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.model.auth.enums.Gender;
import com.fasterxml.jackson.annotation.JsonFormat;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

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
        /**
         * Optional employer code, unique per organization. Alphanumeric is
         * enforced rather than cosmetic: it guarantees no '@', which is what
         * keeps the portal's single login field unambiguous between an email
         * and an employee id. Blank arrives as null.
         */
        @Size(max = 32, message = "Employee ID must be at most 32 characters")
        // Surrounding whitespace is allowed because validation runs BEFORE the
        // controller's blank -> null normalization: without the \s* a
        // whitespace-only value would 400 instead of meaning "no code", which
        // is how every other optional string on this record behaves. Internal
        // spaces and every other character still fail.
        @Pattern(regexp = "^\\s*[A-Za-z0-9]*\\s*$",
                message = "Employee ID must contain only letters and numbers")
        String employeeId,
        Gender gender,
        boolean isConsented,
        Long organizationId) {
}
