package com.bodhpsychometric.dto;

/**
 * One row of the baseline replace-all PUT from MemoryMesh. Element checks are
 * in {@code BaselineSyncService} — {@code @Valid} on a list body does not
 * validate elements.
 *
 * @param baselineQuestionId THIS side's id for an existing question (keeps its
 *                           identity and answers); null for a new one
 */
public record BaselineQuestionSyncRequest(Long baselineQuestionId, String text, Boolean active) {
}
