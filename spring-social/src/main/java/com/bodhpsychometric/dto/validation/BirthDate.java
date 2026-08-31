package com.bodhpsychometric.dto.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * A date that can actually be someone's birthday: on or after 1900-01-01 and
 * not after today.
 *
 * <p>Neither half is available off the shelf as one constraint —
 * {@code @PastOrPresent} gives the upper bound but nothing gives the lower —
 * and splitting it into two annotations would report two different messages
 * for one wrong field. It is a custom constraint so the rule has ONE home:
 * both request DTOs annotate with it, and the XLSX sheet path, which cannot
 * use bean validation at all, calls
 * {@link BirthDateValidator#isInRange(java.time.LocalDate)} directly.
 *
 * <p>Deliberately NOT applied to login. {@code PortalLoginRequest} must keep
 * accepting whatever is already stored, or an account created before this rule
 * would be locked out of itself — dob is the password.
 *
 * <p>Null passes: whether the field is optional is {@code @NotNull}'s question,
 * not this one's.
 */
@Documented
@Constraint(validatedBy = BirthDateValidator.class)
@Target({ ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER,
        ElementType.ANNOTATION_TYPE, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface BirthDate {

    String message() default "Date of birth must be a real date between 01-01-1900 and today";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
