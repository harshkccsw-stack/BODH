package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload for creating/updating a demographic field. options is read only
 * for DROPDOWN fields (display order = list order) and cleared otherwise.
 */
public record DemographicFieldRequest(
        @NotBlank(message = "label is required")
        @Size(max = 150, message = "label must be at most 150 characters")
        String label,
        @NotNull(message = "fieldType is required")
        DemographicFieldType fieldType,
        @Size(max = 255, message = "placeholder must be at most 255 characters")
        String placeholder,
        List<String> options) {
}
