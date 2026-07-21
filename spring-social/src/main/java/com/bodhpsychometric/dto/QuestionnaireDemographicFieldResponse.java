package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;
import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;

/**
 * One row of a questionnaire's demographic form, label and type included so
 * the form can render without a second registry lookup. Built inside a
 * transaction — it walks the lazy demographicField reference.
 */
public record QuestionnaireDemographicFieldResponse(
        Long demographicFieldId,
        String label,
        DemographicFieldType fieldType,
        boolean required,
        int sortOrder) {

    public static QuestionnaireDemographicFieldResponse from(QuestionnaireDemographicField m) {
        return new QuestionnaireDemographicFieldResponse(
                m.getDemographicField().getDemographicFieldId(),
                m.getDemographicField().getLabel(),
                m.getDemographicField().getFieldType(),
                m.isRequired(),
                m.getSortOrder());
    }
}
