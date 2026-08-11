package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotNull;

/**
 * One entry of a questionnaire's demographic form. The PUT carries the full
 * list; position in the list becomes sortOrder.
 */
public record QuestionnaireDemographicFieldRequest(
        @NotNull(message = "demographicFieldId is required") Long demographicFieldId,
        boolean required) {
}
