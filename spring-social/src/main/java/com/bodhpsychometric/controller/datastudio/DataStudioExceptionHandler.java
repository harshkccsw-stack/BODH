package com.bodhpsychometric.controller.datastudio;

import java.util.Map;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.service.datastudio.DataStudioAccess;

/**
 * Turns the Data Studio services' exceptions into status codes.
 *
 * <p>Scoped to this package on purpose. {@link IllegalArgumentException} and
 * {@link IllegalStateException} are the natural way for these services to
 * refuse a bad formula or an in-use delete, but they are also thrown all over
 * the rest of the application, where the existing handler turns them into a
 * 500 — mapping them globally would quietly change the status code of
 * endpoints nobody touched in this change. Restricting the advice to
 * {@code controller.datastudio} keeps the blast radius to what was actually
 * built here.
 *
 * <p>Highest precedence so it is consulted before {@code ApiExceptionHandler}'s
 * {@code Exception} backstop, which would otherwise claim all of these first.
 *
 * <p>The body shape is the {@code {"message": ...}} every other endpoint
 * returns, because that is what both frontends already read.
 *
 * <p>Note that NOT-VISIBLE is answered 404, not 403: telling a stranger that
 * workbook 12 exists but is not theirs is itself a small leak, and there is no
 * case where they need to know the difference. 403 is reserved for someone who
 * genuinely can see the workbook and is merely read-only on it.
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(basePackages = "com.bodhpsychometric.controller.datastudio")
public class DataStudioExceptionHandler {

    @ExceptionHandler(DataStudioAccess.NotSignedInException.class)
    public ResponseEntity<Map<String, String>> handleNotSignedIn(
            DataStudioAccess.NotSignedInException ex) {
        return body(HttpStatus.UNAUTHORIZED, ex.getMessage());
    }

    @ExceptionHandler({NotFoundException.class, DataStudioAccess.NotVisibleException.class})
    public ResponseEntity<Map<String, String>> handleNotFound(RuntimeException ex) {
        return body(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(DataStudioAccess.ReadOnlyException.class)
    public ResponseEntity<Map<String, String>> handleReadOnly(DataStudioAccess.ReadOnlyException ex) {
        return body(HttpStatus.FORBIDDEN, ex.getMessage());
    }

    /** A bad formula, a missing assessment binding, an unknown widget type. */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return body(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    /** A delete refused because something still depends on the row. */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleConflict(IllegalStateException ex) {
        return body(HttpStatus.CONFLICT, ex.getMessage());
    }

    private static ResponseEntity<Map<String, String>> body(HttpStatus status, String message) {
        return ResponseEntity.status(status)
                .body(Map.of("message", message == null ? status.getReasonPhrase() : message));
    }
}
