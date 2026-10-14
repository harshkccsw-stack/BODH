package com.bodhpsychometric.dto.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/** Character check behind {@link PersonName}. */
public class PersonNameValidator implements ConstraintValidator<PersonName, String> {

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        String problem = NameRules.characterProblem(value);
        if (problem == null) {
            return true;
        }
        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(asLiteralTemplate(problem))
                .addConstraintViolation();
        return false;
    }

    /**
     * The message quotes characters the user TYPED, and a violation message is
     * a template: an unescaped "{" or "$" would be read as a parameter or an
     * expression instead of printed. Escaped, the template is plain text.
     */
    private static String asLiteralTemplate(String message) {
        return message
                .replace("\\", "\\\\")
                .replace("{", "\\{")
                .replace("}", "\\}")
                .replace("$", "\\$");
    }
}
