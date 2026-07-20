package com.bodhpsychometric.model.auth.enums;

/**
 * Account state. Legacy rows carry "Active" strings; the value set beyond
 * ACTIVE/INACTIVE is confirmed against the frontend at migration.
 */
public enum PractitionerStatus {
    ACTIVE,
    INACTIVE,
    SUSPENDED
}
