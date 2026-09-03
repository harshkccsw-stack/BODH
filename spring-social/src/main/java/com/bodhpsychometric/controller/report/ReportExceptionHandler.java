package com.bodhpsychometric.controller.report;

import java.util.Map;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.service.report.ReportAccess;
import com.bodhpsychometric.service.report.ReportRenderer;

/**
 * Turns the report services' exceptions into status codes.
 *
 * <p>Scoped to this package for the same reason
 * {@code DataStudioExceptionHandler} is scoped to its own:
 * {@link IllegalArgumentException} and {@link IllegalStateException} are the
 * natural way for these services to refuse a bad binding or an unpublishable
 * template, but they are thrown all over the rest of the application, where the
 * existing handler turns them into a 500. Mapping them globally would quietly
 * change the status code of endpoints nobody touched.
 *
 * <p>Highest precedence so it is consulted before {@code ApiExceptionHandler}'s
 * {@code Exception} backstop. Body shape is the {@code {"message": ...}} both
 * frontends already read.
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(basePackages = "com.bodhpsychometric.controller.report")
public class ReportExceptionHandler {

    @ExceptionHandler(ReportAccess.NotSignedInException.class)
    public ResponseEntity<Map<String, String>> handleNotSignedIn(
            ReportAccess.NotSignedInException ex) {
        return body(HttpStatus.UNAUTHORIZED, ex.getMessage());
    }

    @ExceptionHandler(ReportAccess.ForbiddenException.class)
    public ResponseEntity<Map<String, String>> handleForbidden(ReportAccess.ForbiddenException ex) {
        return body(HttpStatus.FORBIDDEN, ex.getMessage());
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NotFoundException ex) {
        return body(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    /**
     * The template's HTML could not be rendered. 422, not 409 and not 500:
     * the request is fine and the server is fine — the authored document is
     * not, and the author is the one who can fix it, so they get the message.
     */
    @ExceptionHandler(ReportRenderer.RenderFailedException.class)
    public ResponseEntity<Map<String, String>> handleRenderFailed(
            ReportRenderer.RenderFailedException ex) {
        return body(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
    }

    /** An unknown binder type, an unknown core field, a missing literal. */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return body(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    /**
     * A duplicate name, an edit to a published template, or a publish refused
     * because tags are unanswered or the lint failed. All 409: the request is
     * well-formed and the state is what refuses it.
     */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleConflict(IllegalStateException ex) {
        return body(HttpStatus.CONFLICT, ex.getMessage());
    }

    private static ResponseEntity<Map<String, String>> body(HttpStatus status, String message) {
        return ResponseEntity.status(status)
                .body(Map.of("message", message == null ? status.getReasonPhrase() : message));
    }
}
