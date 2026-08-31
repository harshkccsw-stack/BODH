package com.bodhpsychometric.exception;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.bodhpsychometric.config.RequestIdFilter;

import jakarta.validation.ConstraintViolationException;

/**
 * Puts every error into the one {"message": ...} body both frontends read —
 * they all do `e?.response?.data?.message`, in every api file.
 *
 * Extends {@link ResponseEntityExceptionHandler} rather than listing
 * exceptions by hand. The hand-written version had a real defect: its
 * `@ExceptionHandler(Exception.class)` backstop is matched by Spring BEFORE
 * the framework's own DefaultHandlerExceptionResolver, so every Spring MVC
 * exception it did not explicitly name was flattened to a 500 — a request with
 * the wrong Content-Type answered "Something went wrong on our side" instead
 * of 415, and logged a stack trace for what was purely the caller's mistake.
 *
 * The base class owns the status codes for all ~20 of those (415, 406, 503,
 * 413 …), including ResponseStatusException, which reaches it as an
 * ErrorResponseException with its reason carried in ProblemDetail.detail.
 * Everything funnels through {@link #handleExceptionInternal}, which is the
 * single place the body shape is decided — so adopting the base class did not
 * cost us the response format.
 *
 * Two rules for anything added below:
 *   - The message is written FOR the caller. Never pass an exception's own
 *     text through on a 5xx — it names classes, columns and constraints.
 *   - These handlers run AFTER the transaction has rolled back, which is
 *     exactly why conflicts are safe to answer here and NOT inside a
 *     @Transactional controller (catching there marks the transaction
 *     rollback-only and turns a returned 409 into a 500 at commit).
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    private static final String GENERIC_5XX =
            "Something went wrong on our side. Quote the reference below if you report this.";

    // ── Framework exceptions we word better than the framework does ────────

    /** /getById/abc — the path variable or query param will not convert. */
    @Override
    protected ResponseEntity<Object> handleTypeMismatch(TypeMismatchException ex, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        String name = ex instanceof MethodArgumentTypeMismatchException mismatch
                ? mismatch.getName()
                : ex.getPropertyName();
        String message = "\"" + (name == null ? "value" : name) + "\" must be "
                + describe(ex.getRequiredType());
        return withMessage(ex, message, headers, status, request);
    }

    /**
     * Malformed JSON, or a body that will not bind at all. The parser's own
     * message names Jackson internals and the target class, so it is replaced
     * rather than passed on.
     */
    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return withMessage(ex, "The request body could not be read", headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHttpRequestMethodNotSupported(
            HttpRequestMethodNotSupportedException ex, HttpHeaders headers, HttpStatusCode status,
            WebRequest request) {
        // headers carries Allow — passed through, not rebuilt.
        return withMessage(ex, ex.getMethod() + " is not supported on this endpoint",
                headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleNoResourceFoundException(NoResourceFoundException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return withMessage(ex, "No such endpoint", headers, status, request);
    }

    /**
     * @Valid failures on a request body. Reports the FIRST field's message
     * rather than a list: every form on both frontends renders a single error
     * string, and the fields are checked client-side first anyway.
     */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        FieldError first = ex.getBindingResult().getFieldError();
        String message = first == null ? null : first.getDefaultMessage();
        if (message == null) {
            // No FIELD error does not mean no error: a class-level constraint
            // (@E164Phone, which checks the dial code and the number together
            // because neither field can see the other) raises a GLOBAL one, and
            // reading only field errors reported its real message as the
            // useless "Some of the details are invalid".
            ObjectError global = ex.getBindingResult().getGlobalError();
            message = global == null ? null : global.getDefaultMessage();
        }
        return withMessage(ex, message == null ? "Some of the details are invalid" : message,
                headers, status, request);
    }

    /**
     * Constraints on the method signature rather than on a body object —
     * `List<@Valid T>` bulk bodies and constrained request params.
     *
     * Bulk bodies are the reason this reports the position: "item 3: stem is
     * required" is actionable where "stem is required" is not, when the caller
     * just posted forty questions.
     */
    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(
            HandlerMethodValidationException ex, HttpHeaders headers, HttpStatusCode status,
            WebRequest request) {
        String message = ex.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> prefixed(result.getContainerIndex(), error.getDefaultMessage())))
                .filter(m -> m != null && !m.isBlank())
                .findFirst()
                .orElse("Some of the details are invalid");
        return withMessage(ex, message, headers, status, request);
    }

    // ── Not framework exceptions, so not covered by the base class ─────────

    /** Bean-validation constraints raised outside the handler-method path. */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Object> handleConstraintViolation(ConstraintViolationException ex,
            WebRequest request) {
        String message = ex.getConstraintViolations().stream()
                .map(v -> v.getMessage())
                .filter(m -> m != null && !m.isBlank())
                .findFirst()
                .orElse("Some of the details are invalid");
        return withMessage(ex, message, new HttpHeaders(), HttpStatus.BAD_REQUEST, request);
    }

    /**
     * The net BEHIND the controllers' existsBy-style pre-checks, not a
     * replacement for them: the pre-check owns the wording ("that label is
     * already used"), this catches the case where two callers both pass it and
     * the loser hits the constraint at commit. Deliberately vague — the
     * exception names the constraint, which is not the caller's business.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Object> handleDataIntegrity(DataIntegrityViolationException ex,
            WebRequest request) {
        return withMessage(ex, "That change conflicts with existing data — reload and try again",
                new HttpHeaders(), HttpStatus.CONFLICT, request);
    }

    /**
     * The backstop, for exceptions that are neither ours nor the framework's.
     * Spring matches the most specific handler, so everything the base class
     * declares is claimed there first and never reaches this — which is the
     * whole point of extending it.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnexpected(Exception ex, WebRequest request) {
        return withMessage(ex, GENERIC_5XX, new HttpHeaders(), HttpStatus.INTERNAL_SERVER_ERROR, request);
    }

    // ── The single funnel ──────────────────────────────────────────────────

    /**
     * Every handler above and every one inherited from the base class ends
     * here, which is what keeps one body shape across both halves.
     *
     * The base class hands us a {@link ProblemDetail}; we take its detail as
     * the message and drop the rest. That is deliberate rather than lazy: RFC
     * 9457's shape would mean changing how ~15 api files across two frontends
     * read errors, in the same release. Worth doing one day, not as a side
     * effect of fixing status codes.
     */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body,
            HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {

        String detail = body instanceof ProblemDetail problem ? problem.getDetail() : null;

        // ResponseStatusException reaches the base class as an
        // ErrorResponseException, but the reason our services threw does NOT
        // arrive in ProblemDetail.detail — that field is only filled when a
        // MessageSource resolves one. getReason() is the authoritative text,
        // and it is the sentence the frontends actually display
        // ("Invalid email or date of birth"), so it wins over the bare status
        // phrase the detail would otherwise fall back to.
        if ((detail == null || detail.isBlank()) && ex instanceof ResponseStatusException status) {
            detail = status.getReason();
        }

        boolean serverError = statusCode.is5xxServerError();

        Map<String, Object> payload = new LinkedHashMap<>();
        // A 5xx never describes itself to the caller, whatever the framework
        // put in the detail.
        payload.put("message", serverError ? GENERIC_5XX : messageOr(detail, statusCode));

        String requestId = RequestIdFilter.current();
        if (serverError && requestId != null) {
            payload.put("requestId", requestId);
        }

        // 5xx logs the stack (it is a bug we have to fix); 4xx logs one line
        // (it is the caller's mistake, and a stack per bad form submission is
        // noise).
        String where = describeRequest(request);
        if (serverError) {
            log.error("{} -> {} : {}", where, statusCode.value(), ex.toString(), ex);
        } else {
            log.warn("{} -> {} : {}", where, statusCode.value(), payload.get("message"));
        }

        return new ResponseEntity<>(payload, headers, statusCode);
    }

    /** Route a custom message through the funnel, keeping any headers set. */
    private ResponseEntity<Object> withMessage(Exception ex, String message, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        return handleExceptionInternal(ex, ProblemDetail.forStatusAndDetail(status, message),
                headers, status, request);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    /** A blank detail still has to say something the caller can act on. */
    private static String messageOr(String detail, HttpStatusCode status) {
        if (detail != null && !detail.isBlank()) {
            return detail;
        }
        HttpStatus resolved = HttpStatus.resolve(status.value());
        return resolved == null ? "Request failed" : resolved.getReasonPhrase();
    }

    /** "item 3: …" for an element of a bulk body; the bare message otherwise. */
    private static String prefixed(Integer containerIndex, String message) {
        if (message == null || message.isBlank() || containerIndex == null) {
            return message;
        }
        return "item " + (containerIndex + 1) + ": " + message;
    }

    /** Type names the caller can act on — "a number", not "a Long". */
    private static String describe(Class<?> requiredType) {
        if (requiredType == null) {
            return "a valid value";
        }
        if (Number.class.isAssignableFrom(requiredType)
                || requiredType == int.class || requiredType == long.class
                || requiredType == double.class) {
            return "a number";
        }
        if (requiredType == Boolean.class || requiredType == boolean.class) {
            return "true or false";
        }
        if (requiredType.isEnum()) {
            return "one of: " + String.join(", ",
                    java.util.Arrays.stream(requiredType.getEnumConstants())
                            .map(String::valueOf).toList());
        }
        return "a valid " + requiredType.getSimpleName();
    }

    /** "GET /api/questions/getById/abc" for the log line. */
    private static String describeRequest(WebRequest request) {
        if (request instanceof ServletWebRequest servlet) {
            return servlet.getHttpMethod() + " " + servlet.getRequest().getRequestURI();
        }
        return request.getDescription(false);
    }
}
