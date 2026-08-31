package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.dto.validation.BirthDate;
import com.bodhpsychometric.dto.validation.E164Phone;
import com.bodhpsychometric.dto.validation.PhoneFields;
import com.bodhpsychometric.dto.validation.PhoneRules;
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
@E164Phone
public record RespondentRequest(
        @NotBlank(message = "Name is required") String name,
        @NotBlank(message = "Email is required") @Email(message = "Email must be a valid address") String email,
        /**
         * Bounded since 2026-08-31: a real date from 1900 up to and including
         * today. There is no minimum age — the only thing being excluded is a
         * date nobody can have been born on. It matters more than usual here
         * because dob is the portal password, so a future date is a permanent
         * typo'd credential rather than a cosmetic error.
         */
        @NotNull(message = "Date of birth is required")
        @BirthDate
        @JsonFormat(pattern = "dd-MM-yyyy") LocalDate dob,
        /**
         * The dial code, '+' included. Required alongside the number since
         * 2026-08-31: a bare ten digits cannot be dialled and cannot be
         * length-checked, because both need to know which country it is.
         */
        @NotBlank(message = "Country code is required")
        @Pattern(regexp = PhoneRules.COUNTRY_CODE_REGEX,
                message = PhoneRules.COUNTRY_CODE_MESSAGE)
        String phoneCountryCode,
        /**
         * The national number in E.164 form: digits only, no country code and
         * no trunk prefix. Replaces the loose free-text rule this field carried
         * between 2026-08-24 and 2026-08-31, which accepted anything roughly
         * phone-shaped because it had no country to check against. The
         * class-level {@code @E164Phone} owns the 15-digit total.
         *
         * <p>Consequence worth knowing, and unchanged from the earlier rule:
         * this record feeds UPDATE as well as create, so editing a respondent
         * whose stored phone predates the split means re-entering it as a code
         * plus a number. That is the intent — the field gets brought up to
         * shape by whoever touches the record — but there is no bulk
         * migration, and untouched old rows keep their free text.
         */
        @NotBlank(message = "Phone number is required")
        @Pattern(regexp = PhoneRules.NATIONAL_NUMBER_REGEX,
                message = PhoneRules.NATIONAL_NUMBER_MESSAGE)
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
        /**
         * Required since 2026-08-24. PREFER_NOT_TO_SAY is the way out for a
         * respondent who declines; a null gender on an existing profile still
         * means the question predates the requirement.
         */
        @NotNull(message = "Gender is required")
        Gender gender,
        boolean isConsented,
        Long organizationId) implements PhoneFields {
}
