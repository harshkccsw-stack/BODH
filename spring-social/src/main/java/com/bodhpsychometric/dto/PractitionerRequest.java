package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.dto.validation.BirthDate;
import com.bodhpsychometric.dto.validation.E164Phone;
import com.bodhpsychometric.dto.validation.PhoneFields;
import com.bodhpsychometric.dto.validation.PhoneRules;
import com.bodhpsychometric.model.auth.enums.PractitionerStatus;
import com.bodhpsychometric.model.auth.enums.Vertical;
import com.fasterxml.jackson.annotation.JsonFormat;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Create/update payload for a practitioner. One request feeds two rows: the
 * User identity (email + dob — dob is the login credential) and the
 * PractitionerUser profile (name, phone, status, vertical, organization).
 *
 * dob travels as dd-MM-yyyy on the wire (product decision) — the entity
 * still stores a real LocalDate. Null practitionerStatus defaults to ACTIVE.
 *
 * Both personal-detail rules are the RESPONDENT's rules, annotated from the
 * same constants rather than copied: {@code @BirthDate} for the date, and the
 * {@code PhoneRules} pair plus a class-level {@code @E164Phone} for the phone.
 * A staff record has no reason to be looser than the record of the people
 * being assessed, and it was only looser because it was built first.
 */
@E164Phone
public record PractitionerRequest(
        @NotBlank(message = "Name is required")
        @Size(max = 20, message = "Name must be at most 20 characters") String name,
        @NotBlank(message = "Email is required") @Email(message = "Email must be a valid address") String email,
        // Bounded exactly as a respondent's is, and for the same reason: a
        // practitioner's dob is their dashboard login credential, so a future
        // date is a password the person can never reproduce.
        @NotNull(message = "Date of birth is required")
        @BirthDate
        @JsonFormat(pattern = "dd-MM-yyyy") LocalDate dob,
        /**
         * The dial code, '+' included. Required alongside the number: a bare
         * ten digits cannot be dialled and cannot be length-checked, because
         * both need to know which country it is.
         */
        @NotBlank(message = "Country code is required")
        @Pattern(regexp = PhoneRules.COUNTRY_CODE_REGEX,
                message = PhoneRules.COUNTRY_CODE_MESSAGE)
        String phoneCountryCode,
        /**
         * The national number in E.164 form: digits only, no country code and
         * no trunk prefix. This field was free text with NO validation at all
         * until now, and optional besides. The class-level {@code @E164Phone}
         * owns the 15-digit total.
         *
         * <p>Consequence worth knowing, exactly as on RespondentRequest: this
         * record feeds UPDATE as well as create, so editing a practitioner
         * whose stored phone predates the split means re-entering it as a code
         * plus a number. That is the intent — the field is brought up to shape
         * by whoever touches the record — but there is no bulk migration, and
         * untouched old rows keep their free text.
         */
        @NotBlank(message = "Phone number is required")
        @Pattern(regexp = PhoneRules.NATIONAL_NUMBER_REGEX,
                message = PhoneRules.NATIONAL_NUMBER_MESSAGE)
        String phone,
        PractitionerStatus practitionerStatus,
        Vertical vertical,
        Long organizationId) implements PhoneFields {
}
