package com.bodhpsychometric.model.demographics.enums;

/**
 * Input control a demographic field renders as. DROPDOWN (pick one) and
 * CHECKLIST (tick any number) read their choices from the field's options
 * list; the rest are free inputs validated by kind.
 *
 * CHECKLIST is APPENDED — the MySQL column is an enum (V39), and the member
 * list there must only ever grow at the end.
 */
public enum DemographicFieldType {
    TEXT,
    NUMBER,
    DATE,
    DROPDOWN,
    CHECKLIST;

    /** True for the types whose answer must be one of the field's choices. */
    public boolean hasChoices() {
        return this == DROPDOWN || this == CHECKLIST;
    }
}
