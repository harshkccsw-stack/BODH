package com.bodhpsychometric.dto.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

/**
 * Class-level: the dial code and the national number, TOGETHER, stay inside
 * E.164's 15-digit ceiling.
 *
 * <p>It has to sit on the record rather than on either field because neither
 * field can see the other, and the ceiling is a property of the pair. The two
 * {@code @Pattern}s beside it still own the shape of each half on its own.
 */
@Documented
@Constraint(validatedBy = E164Phone.Validator.class)
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface E164Phone {

    String message() default "Country code and phone number together cannot be more than 15 digits";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<E164Phone, PhoneFields> {

        @Override
        public boolean isValid(PhoneFields value, ConstraintValidatorContext context) {
            return value == null
                    || PhoneRules.withinE164(value.phoneCountryCode(), value.phone());
        }
    }
}
