package com.bodhpsychometric.model.item;

/**
 * Item review workflow. Mutable metadata — changing it never triggers
 * copy-on-write. Legacy rows ('DRAFT', free-text variants) map onto these at
 * migration.
 */
public enum ValidationStatus {
    DRAFT,
    UNDER_REVIEW,
    VALIDATED
}
