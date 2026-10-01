package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload for creating/updating a demographic field. options and
 * otherOptionLabel are read only for DROPDOWN and CHECKLIST fields (display
 * order = list order, the write-in always last) and cleared otherwise.
 * otherOptionLabel blank or absent = the field has no write-in "Other".
 */
public record DemographicFieldRequest(
        @NotBlank(message = "label is required")
        @Size(max = 150, message = "label must be at most 150 characters")
        String label,
        @NotNull(message = "fieldType is required")
        DemographicFieldType fieldType,
        @Size(max = 255, message = "placeholder must be at most 255 characters")
        String placeholder,
        List<String> options,
        @Size(max = 255, message = "the Other choice's label must be at most 255 characters")
        String otherOptionLabel) {
}
