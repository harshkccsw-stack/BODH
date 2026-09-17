package com.bodhpsychometric.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.NotNull;

/**
 * MemoryMesh asking "is this a person of yours?": the same two shapes its
 * own login form sends — one identifier box (email or employee id), or the
 * dial code and number picked separately — plus the date of birth.
 */
public record MemoryMeshAuthVerifyRequest(
        String identifier,
        String phoneCountryCode,
        String phone,
        @NotNull(message = "Date of birth is required") LocalDate dob) {

    public boolean hasPhonePair() {
        return phoneCountryCode != null && !phoneCountryCode.isBlank()
                && phone != null && !phone.isBlank();
    }

    public boolean hasIdentifier() {
        return identifier != null && !identifier.isBlank();
    }
}
