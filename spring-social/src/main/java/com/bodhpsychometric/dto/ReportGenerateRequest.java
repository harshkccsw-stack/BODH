package com.bodhpsychometric.dto;

import java.util.List;

/**
 * Who receives a report in this batch. Empty or absent means everyone who
 * completed. The cohort the rules run over is the whole population either way.
 */
public record ReportGenerateRequest(List<Long> attemptIds) {

    public List<Long> attemptIdsOrEmpty() {
        return attemptIds == null ? List.of() : attemptIds;
    }
}
