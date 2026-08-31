package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.dto.validation.BirthDate;
import com.bodhpsychometric.dto.validation.E164Phone;
import com.bodhpsychometric.dto.validation.PhoneFields;
import com.bodhpsychometric.dto.validation.PhoneRules;
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
@E164Phone
public record RegistrationSubmitRequest(
        @NotBlank(message = "Name is required") String name,

        @NotBlank(message = "Email is required")
        @Email(message = "Email must be a valid address") String email,

        /**
         * The credential — this is what the respondent will sign in with, so a
         * date that cannot be a birthday is a password they will never be able
         * to reproduce. Bounded since 2026-08-31 to 1900-01-01 .. today; no
         * minimum age, because excluding impossible dates is the whole point
         * and who may sit an assessment is the organization's rule, not this
         * form's.
         */
        @NotNull(message = "Date of birth is required")
        @BirthDate LocalDate dob,

        /**
         * The dial code, '+' included, chosen from a list on the form.
         * Required alongside the number since 2026-08-31.
         */
        @NotBlank(message = "Country code is required")
        @Pattern(regexp = PhoneRules.COUNTRY_CODE_REGEX,
                message = PhoneRules.COUNTRY_CODE_MESSAGE)
        String phoneCountryCode,

        /**
         * The national number in E.164 form: digits only, no country code and
         * no trunk prefix. Until 2026-08-31 this was one free-text field
         * checked by a deliberately loose pattern, on the reasoning that a form
         * filled in from every country cannot know what a number should look
         * like. The country code beside it is what removed that reasoning, and
         * E.164 is the standard the pair now follows.
         */
        @NotBlank(message = "Phone number is required")
        @Pattern(regexp = PhoneRules.NATIONAL_NUMBER_REGEX,
                message = PhoneRules.NATIONAL_NUMBER_MESSAGE)
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
        String employeeId) implements PhoneFields {

    // There is deliberately no assessmentId. The link alone decides: an
    // assessment-scoped one fixes the assessment, and an org-wide one grants
    // none at all — the respondent is joining the organization and an
    // administrator assigns to them afterwards. So no body can ever choose
    // what someone gets, and there is nothing to re-validate against the
    // catalog. (A stale client still sending the field is harmless: Spring
    // Boot leaves FAIL_ON_UNKNOWN_PROPERTIES disabled, so it is ignored.)
}
