package com.bodhpsychometric.dto;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * The workbook's Items_Master tab, as CSV text, for one assessment.
 *
 * <p>{@code assessmentId} is REQUIRED here, unlike a rule import where it is
 * optional. A rule can be global — MQ/MQT ids are global, so a rule written
 * over them runs anywhere. A binding cannot: it says what {@code I1} means in
 * one instrument, and the same bank question is a different code in the next
 * workbook.
 *
 * @param questionOverrides item code → questionId a reviewer picked by hand.
 *        Honoured ahead of every automatic rule, because the whole point of the
 *        review step is that a person can overrule the matcher.
 */
public record ItemMasterImportRequest(

        @NotBlank(message = "Choose a file to import")
        @Size(max = 2_000_000, message = "That file is too large to import")
        String csv,

        @NotNull(message = "Choose which assessment these items belong to")
        Long assessmentId,

        Map<String, Long> questionOverrides) {

    public Map<String, Long> overrides() {
        return questionOverrides == null ? Map.of() : questionOverrides;
    }
}
