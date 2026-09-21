package com.bodhpsychometric.dto;

import java.util.List;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/**
 * Questions to delete in one go, from the bank page's multi-select.
 *
 * <p>All-or-nothing, like every other bulk write here: a question that has
 * responses or sits in a questionnaire blocks the whole call and is named in
 * the reply, so the caller can drop it from the selection and try again.
 * Deleting the ones that happened to be free and silently keeping the rest
 * would leave the author unsure what they now have.
 */
public record QuestionBulkDeleteRequest(
        @NotEmpty(message = "select at least one question")
        @Size(max = 500, message = "at most 500 questions at a time")
        List<Long> questionIds) {
}
