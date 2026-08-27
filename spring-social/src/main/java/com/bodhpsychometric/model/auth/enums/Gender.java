package com.bodhpsychometric.model.auth.enums;

public enum Gender {
    MALE,
    FEMALE,
    OTHER,
    /**
     * Declined to answer — NOT the same as a null gender, which means the
     * question was never put to them (every respondent created before the
     * field became required). Added by V22, which appends it to the MySQL
     * enum's value list rather than inserting it, so no stored row moves.
     */
    PREFER_NOT_TO_SAY
}
