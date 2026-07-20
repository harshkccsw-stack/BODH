package com.bodhpsychometric.service;

/** State conflict — duplicate pair, cap exhausted, illegal transition. HTTP 409. */
public class ConflictException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ConflictException(String message) {
        super(message);
    }
}
