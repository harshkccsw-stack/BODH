package com.bodhpsychometric.service;

/** Request violates a domain rule (bad format, wrong item's option…). HTTP 400. */
public class ValidationException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ValidationException(String message) {
        super(message);
    }
}
