package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.assessment.enums.QuestionLayout;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload for creating/updating an assessment. questionnaireId maps the
 * assessment to exactly one catalog questionnaire; nullable config fields
 * fall back to the entity defaults (T&C on, INACTIVE, autoNext off).
 */
public record AssessmentRequest(
        @NotBlank(message = "name is required")
        @Size(max = 200, message = "name must be at most 200 characters")
        String name,
        @NotNull(message = "questionnaireId is required")
        Long questionnaireId,
        Boolean showTermsAndConditions,
        // Consent body as the editor's HTML subset. Null leaves whatever is
        // stored alone; the allowed markup and the "required when the toggle
        // is on" rule are enforced in the controller (see AssessmentTerms).
        @Size(max = 20_000, message = "termsAndConditions must be at most 20000 characters")
        String termsAndConditions,
        // Thank-you page (V46). All three: null leaves what is stored alone —
        // a caller that does not know the fields must not wipe them — and a
        // blank value clears it (the message falls back to the default, the
        // contact row disappears). Name and email are both or neither; the
        // controller checks the pair, and the message's markup, like the terms.
        @Size(max = 20_000, message = "thankYouMessage must be at most 20000 characters")
        String thankYouMessage,
        @Size(max = 200, message = "Contact person name must be at most 200 characters")
        String contactName,
        @Size(max = 254, message = "Contact person email must be at most 254 characters")
        @Email(message = "Contact person email must be a valid address")
        String contactEmail,
        AssessmentStatus status,
        Boolean autoNext,
        // Show the portal question index/navigator during the attempt.
        // Null falls back to the entity default (true).
        Boolean showQuestionIndex,
        // One question per page, or a whole section per scrollable page.
        // Null falls back to the entity default (ONE_PER_PAGE).
        QuestionLayout questionLayout,
        // Give the portal's focus popup a 10-minute deadline and abandon the
        // attempt if one is left unanswered that long. Null falls back to the
        // entity default (false) — an omitted field must never arm the timer.
        Boolean attentionTimer,
        // Snapshot marked answers into Redis on section change so an ONGOING
        // attempt can resume with them backfilled. Null falls back to the
        // entity default (false).
        Boolean savePartialAnswers,
        // Availability window, both optional — null means "not set". Ordering
        // (end on/after start) is cross-field, so the controller pre-checks it
        // rather than an annotation here.
        LocalDate startDate,
        LocalDate endDate) {
}
