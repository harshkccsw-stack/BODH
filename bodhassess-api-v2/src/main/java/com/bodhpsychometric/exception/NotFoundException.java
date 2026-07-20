package com.bodhpsychometric.exception;

/** Requested row does not exist or is not live. Maps to HTTP 404 in the API. */
public class NotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public NotFoundException(String what, Object id) {
        super(what + " not found: " + id);
    }
}
