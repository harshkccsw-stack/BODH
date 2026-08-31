package com.bodhpsychometric.dto.validation;

import java.time.LocalDate;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/** Bounds check behind {@link BirthDate}. */
public class BirthDateValidator implements ConstraintValidator<BirthDate, LocalDate> {

    /**
     * The floor both frontends already used when parsing DD/MM/YYYY, lifted
     * here so the server agrees rather than trusting them. It is a typo catch
     * ("1091", "1899"), not an age policy — there is deliberately no minimum
     * age, because the products this platform delivers are run on cohorts
     * whose age range is the organization's business, not this validator's.
     */
    public static final LocalDate EARLIEST = LocalDate.of(1900, 1, 1);

    /**
     * Today is read per call rather than cached in a field: this class is a
     * singleton in the validator factory and would otherwise pin the boot
     * date, so a server left running would start rejecting today's date at
     * midnight.
     */
    public static boolean isInRange(LocalDate dob) {
        return dob != null && !dob.isBefore(EARLIEST) && !dob.isAfter(LocalDate.now());
    }

    @Override
    public boolean isValid(LocalDate value, ConstraintValidatorContext context) {
        // Null is @NotNull's business — reporting it here too would answer one
        // empty field with two messages.
        return value == null || isInRange(value);
    }
}
