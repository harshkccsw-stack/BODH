package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.model.auth.enums.Gender;

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

        /**
         * Required since 2026-08-24. The pattern is deliberately loose — digits
         * plus the punctuation people actually type, 7—20 characters — because
         * this form is filled in from every country and a stricter rule would
         * reject real numbers. It is a "looks like a phone number" check, not a
         * validation of reachability, which only sending to it could prove.
         */
        @NotBlank(message = "Phone number is required")
        @Pattern(regexp = "^\\+?[0-9][0-9 ()\\-]{5,18}[0-9]$",
                message = "Enter a valid phone number")
        String phone,

        /**
         * Required since 2026-08-24, which is why {@code PREFER_NOT_TO_SAY}
         * exists — a required question with no way to decline is not a
         * question. Declining is stored as that value; null on a profile still
         * means the question was never asked.
         */
        @NotNull(message = "Gender is required")
        Gender gender,

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
        String employeeId) {

    // There is deliberately no assessmentId. The link alone decides: an
    // assessment-scoped one fixes the assessment, and an org-wide one grants
    // none at all — the respondent is joining the organization and an
    // administrator assigns to them afterwards. So no body can ever choose
    // what someone gets, and there is nothing to re-validate against the
    // catalog. (A stale client still sending the field is harmless: Spring
    // Boot leaves FAIL_ON_UNKNOWN_PROPERTIES disabled, so it is ignored.)
}
