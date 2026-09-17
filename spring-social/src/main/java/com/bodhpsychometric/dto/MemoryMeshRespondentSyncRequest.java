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
 * A respondent MemoryMesh has just created, being mirrored here.
 *
 * <p>The fifth respondent creation point, and it carries the SAME identity
 * minimum as the other four (2026-08-24 / 2026-08-31): name, email, dob, the
 * two-part phone, gender. A mirror that could skip gender would quietly
 * reintroduce the null-means-never-asked rows that rule exists to stop.
 *
 * <p>Two deliberate differences from {@link RespondentRequest}:
 * <ul>
 *   <li>{@code dob} is ISO {@code yyyy-MM-dd} on the wire, not
 *       {@code dd-MM-yyyy}. That format is a product decision for FORMS; this
 *       is a server talking to a server, and ISO is the only unambiguous
 *       choice between two codebases.</li>
 *   <li>No {@code organizationId}, {@code employeeId} or consent. MemoryMesh
 *       knows nothing of this side's organizations, an employee code is an
 *       admin's to assign, and consent is recorded by the take flow's terms
 *       step — never by a machine.</li>
 * </ul>
 *
 * @param sourceUserId MemoryMesh's own id for the person, logged for tracing
 *                     only; nothing here is keyed on it
 */
@E164Phone
public record MemoryMeshRespondentSyncRequest(
        @NotBlank(message = "Name is required")
        @Size(max = 255, message = "Name cannot be longer than 255 characters")
        String name,

        @NotBlank(message = "Email is required")
        @Email(message = "Email must be a valid address")
        String email,

        @NotBlank(message = "Country code is required")
        @Pattern(regexp = PhoneRules.COUNTRY_CODE_REGEX, message = PhoneRules.COUNTRY_CODE_MESSAGE)
        String phoneCountryCode,

        @NotBlank(message = "Phone number is required")
        @Pattern(regexp = PhoneRules.NATIONAL_NUMBER_REGEX, message = PhoneRules.NATIONAL_NUMBER_MESSAGE)
        String phone,

        @NotNull(message = "Date of birth is required")
        @BirthDate
        LocalDate dob,

        @NotNull(message = "Gender is required")
        Gender gender,

        Long sourceUserId) implements PhoneFields {
}
