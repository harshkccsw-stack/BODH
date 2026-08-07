package com.bodhpsychometric.exception;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/**
 * Puts thrown errors into the same {"message": ...} body the controllers
 * return by hand, so a client has one shape to read regardless of which half
 * of the codebase answered.
 *
 * This is not cosmetic. Without it these responses fall through to Spring's
 * default error handler, whose body depends on configuration the application
 * does not set:
 *   - server.error.include-message defaults to NEVER, so in production the
 *     reason would be blank — "An account with this email already exists"
 *     would reach the respondent as an empty error.
 *   - spring-boot-devtools flips that (and include-stacktrace) to ALWAYS,
 *     which is why it looks fine in development and why the difference is
 *     easy to miss. Devtools is optional/runtime scope, so it is absent from
 *     the packaged jar and the production behaviour is the bare default.
 * Handling the exception explicitly makes the two environments agree, and
 * drops the stack trace that the dev default otherwise returns to callers.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    /** What PortalAuthService, PortalRegistrationService and friends throw. */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleResponseStatus(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode())
                .body(Map.of("message", messageOr(e.getReason(), e.getStatusCode())));
    }

    /**
     * @Valid failures on a request body. Reports the FIRST field's message
     * rather than a list: every form on both frontends renders a single error
     * string, and the fields are checked client-side first anyway.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException e) {
        FieldError first = e.getBindingResult().getFieldError();
        String message = first == null || first.getDefaultMessage() == null
                ? "Some of the details are invalid"
                : first.getDefaultMessage();
        return ResponseEntity.badRequest().body(Map.of("message", message));
    }

    /** A blank reason still has to say something the user can act on. */
    private static String messageOr(String reason, HttpStatusCode status) {
        if (reason != null && !reason.isBlank()) {
            return reason;
        }
        HttpStatus resolved = HttpStatus.resolve(status.value());
        return resolved == null ? "Request failed" : resolved.getReasonPhrase();
    }
}
