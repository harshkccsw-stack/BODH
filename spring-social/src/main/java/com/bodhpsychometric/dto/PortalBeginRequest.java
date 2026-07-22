package com.bodhpsychometric.dto;

import java.util.List;

/**
 * Payload for starting an attempt: the filled demographic form. Values are
 * keyed by demographicFieldId and validated against the questionnaire's
 * mapped fields — empty (or absent) when the questionnaire has no form.
 */
public record PortalBeginRequest(List<DemographicEntry> demographics) {

    public record DemographicEntry(Long demographicFieldId, String value) {
    }
}
