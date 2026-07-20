package com.bodhpsychometric.model.demographics.enums;

/**
 * Input control a demographic field renders as. DROPDOWN reads its choices
 * from the field's options list; the rest are free inputs validated by kind.
 */
public enum DemographicFieldType {
    TEXT,
    NUMBER,
    DATE,
    DROPDOWN
}
