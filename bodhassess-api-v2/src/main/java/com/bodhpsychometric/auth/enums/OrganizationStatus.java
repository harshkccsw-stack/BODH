package com.bodhpsychometric.bodhassess.domain.auth.enums;

/**
 * Lifecycle of an organization. A public self-registration is simply an
 * Organization born PENDING; an admin approves it to ACTIVE before it can
 * receive any assessment allotments.
 */
public enum OrganizationStatus {
    PENDING,
    ACTIVE,
    SUSPENDED
}
