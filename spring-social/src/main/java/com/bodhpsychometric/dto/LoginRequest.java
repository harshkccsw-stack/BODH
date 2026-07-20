package com.bodhpsychometric.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** Dashboard login credentials: email + date of birth (product decision). */
public record LoginRequest(
        @NotBlank @Email String email,
        @NotNull LocalDate dob) {
}
