package com.bodhpsychometric.dto;

/**
 * One entry of a questionnaire's demographic form. The PUT carries the full
 * list; position in the list becomes sortOrder.
 */
public record QuestionnaireDemographicFieldRequest(Long demographicFieldId, boolean required) {
}
