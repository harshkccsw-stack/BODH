package com.bodhpsychometric.bodhassess.domain.people;

/**
 * Account state. Legacy rows carry "Active" strings; the value set beyond
 * ACTIVE/INACTIVE is confirmed against the frontend at migration.
 */
public enum UserStatus {
    ACTIVE,
    INACTIVE,
    SUSPENDED
}
