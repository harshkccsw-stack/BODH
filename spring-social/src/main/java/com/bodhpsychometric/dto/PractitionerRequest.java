package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.model.auth.enums.PractitionerStatus;
import com.bodhpsychometric.model.auth.enums.Vertical;
import com.fasterxml.jackson.annotation.JsonFormat;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Create/update payload for a practitioner. One request feeds two rows: the
 * User identity (email + dob — dob is the login credential) and the
 * PractitionerUser profile (name, phone, status, vertical, organization).
 *
 * dob travels as dd-MM-yyyy on the wire (product decision) — the entity
 * still stores a real LocalDate. Null practitionerStatus defaults to ACTIVE.
 */
public record PractitionerRequest(
        @NotBlank(message = "Name is required")
        @Size(max = 20, message = "Name must be at most 20 characters") String name,
        @NotBlank(message = "Email is required") @Email(message = "Email must be a valid address") String email,
        @NotNull(message = "Date of birth is required")
        @JsonFormat(pattern = "dd-MM-yyyy") LocalDate dob,
        String phone,
        PractitionerStatus practitionerStatus,
        Vertical vertical,
        Long organizationId) {
}
