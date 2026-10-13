package com.bodhpsychometric.dto.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * A person's name: the characters {@link NameRules} allows, with at least one
 * letter. Length stays with {@code @Size} beside it, because the cap differs —
 * a practitioner's is 20, a respondent's the column's 255.
 *
 * <p>The message is built per value (it names the refused characters), so
 * {@link #message()} is only the fallback. Null and blank pass: that is
 * {@code @NotBlank}'s question.
 */
@Documented
@Constraint(validatedBy = PersonNameValidator.class)
@Target({ ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER,
        ElementType.ANNOTATION_TYPE, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface PersonName {

    String message() default "Name can only contain letters, spaces, apostrophes, hyphens and full stops";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
