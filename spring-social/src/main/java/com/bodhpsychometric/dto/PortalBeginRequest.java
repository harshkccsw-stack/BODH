package com.bodhpsychometric.dto;

import java.util.List;

/**
 * Payload for starting an attempt: the filled demographic form. Values are
 * keyed by demographicFieldId and validated against the questionnaire's
 * mapped fields — empty (or absent) when the questionnaire has no form.
 */
public record PortalBeginRequest(List<DemographicEntry> demographics) {

    /**
     * One answered field. A CHECKLIST sends its ticks in {@code values} and
     * leaves {@code value} empty; every other type sends {@code value}. The
     * wrong one is a 400. {@code otherText} is what was typed for the field's
     * write-in "Other" choice — required when that choice is picked or
     * ticked, refused otherwise.
     */
    public record DemographicEntry(Long demographicFieldId, String value, List<String> values,
            String otherText) {
    }
}
