package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.demographics.DemographicField;
import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;

/**
 * What the API returns for a demographic field. options walks a lazy
 * element collection — build inside a transaction.
 */
public record DemographicFieldResponse(
        Long demographicFieldId,
        String label,
        DemographicFieldType fieldType,
        String placeholder,
        List<String> options) {

    public static DemographicFieldResponse from(DemographicField f) {
        return new DemographicFieldResponse(
                f.getDemographicFieldId(),
                f.getLabel(),
                f.getFieldType(),
                f.getPlaceholder(),
                List.copyOf(f.getOptions()));
    }
}
