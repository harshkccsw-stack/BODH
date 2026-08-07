package com.bodhpsychometric.model.organization.enums;

/**
 * Whether a registration link may still be used. Deliberately separate from
 * expiry and the use cap: those two are facts about the link's own limits,
 * this is the admin's switch. Any of the three failing makes the link
 * unusable, and the portal reports all of them the same way so a probe cannot
 * tell a revoked link from one that never existed.
 */
public enum RegistrationTokenStatus {
    ACTIVE,
    INACTIVE
}
