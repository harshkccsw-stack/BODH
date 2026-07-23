package com.bodhpsychometric.dto;

import java.util.List;

import org.springframework.data.domain.Page;

/**
 * Page envelope for the report listings — a stable JSON shape owned by us,
 * instead of serializing Spring's Page (whose wire format is not guaranteed).
 */
public record ReportPageResponse<T>(
        List<T> items,
        int page,
        int size,
        long totalItems,
        int totalPages) {

    public static <T> ReportPageResponse<T> from(Page<T> page) {
        return new ReportPageResponse<>(page.getContent(), page.getNumber(),
                page.getSize(), page.getTotalElements(), page.getTotalPages());
    }
}
