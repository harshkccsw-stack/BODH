package com.bodhpsychometric.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * Grant (or re-grant) one dashboard user access to a workbook. Re-granting the
 * same user simply changes their role — the unique key means there is only
 * ever one row per pair, and the service updates rather than inserting a
 * second.
 */
public record DsShareRequest(
        @NotNull(message = "sharedWithUserId is required") Long sharedWithUserId,
        @Pattern(regexp = "EDITOR|VIEWER", message = "Role must be EDITOR or VIEWER") String role) {
}
