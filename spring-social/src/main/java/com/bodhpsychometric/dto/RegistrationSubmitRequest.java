package com.bodhpsychometric.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * What the respondent fills in on /register/{token}. The link decides the
 * organization, so it is deliberately absent here — a body cannot choose which
 * organization to join.
 *
 * dob is plain ISO (yyyy-MM-dd), matching {@link PortalLoginRequest} rather
 * than {@link RespondentRequest}'s dd-MM-yyyy: this is a portal request, and
 * the portal already converts its DD/MM/YYYY input to ISO before sending.
 */
public record RegistrationSubmitRequest(
        @NotBlank(message = "Name is required") String name,

        @NotBlank(message = "Email is required")
        @Email(message = "Email must be a valid address") String email,

        /** The credential — this is what the respondent will sign in with. */
        @NotNull(message = "Date of birth is required") LocalDate dob,

        String phone,

        /**
         * Optional employer code. Alphanumeric is load-bearing rather than
         * cosmetic: it guarantees no '@', which is what keeps the portal's
         * single login field unambiguous between an email and an employee id.
         * The \s* mirrors RespondentRequest — validation runs before the
         * blank-to-null normalization, so a whitespace-only value has to mean
         * "no code" instead of 400.
         */
        @Size(max = 32, message = "Employee ID must be at most 32 characters")
        @Pattern(regexp = "^\\s*[A-Za-z0-9]*\\s*$",
                message = "Employee ID must contain only letters and numbers")
        String employeeId,

        /**
         * Required on an org-wide link, where the respondent picks. Ignored on
         * an assessment-scoped link, which already fixes the choice — sending
         * a DIFFERENT one there is a 400 rather than a silent override.
         */
        Long assessmentId) {
}
