package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Payload for creating/renaming an MQT. Exactly one anchor is used on
 * create: measuredQualityId for a root node, parentTypeId for a sub-MQT
 * (the MQ is derived from the parent, so a child can never land in a
 * different MQ than its parent). For rename only name is read.
 */
public record MeasuredQualityTypeRequest(
        Long measuredQualityId,
        Long parentTypeId,
        @NotBlank(message = "name is required")
        @Size(max = 150, message = "name must be at most 150 characters")
        String name) {
}
