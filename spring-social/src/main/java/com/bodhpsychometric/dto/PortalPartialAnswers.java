package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.dto.PortalSubmitRequest.AnswerEntry;

/**
 * One attempt's partial-answer snapshot as Redis stores it (1-day TTL): the
 * FULL set of answers marked so far, in the same {@link AnswerEntry} shape the
 * final submit uses — so the portal's backfill and its submit payload are one
 * format. Each save replaces the previous snapshot whole; there is no
 * incremental merge to get wrong.
 *
 * <p>Deliberately NOT validated like a submission: it is partial by nature
 * (unanswered questions, half-filled grids), and the once-and-for-all
 * validation still happens at submit. Losing one of these costs a respondent
 * some re-clicking, never data — MySQL is untouched until submit.
 */
public record PortalPartialAnswers(
        Long respondentAssessmentMappingId,
        List<AnswerEntry> answers,
        long savedAtMillis) {
}
