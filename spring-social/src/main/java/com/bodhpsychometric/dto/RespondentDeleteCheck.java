package com.bodhpsychometric.dto;

import java.util.List;

/**
 * What deleting one respondent would take with it — the dashboard's warning
 * popup reads this before it offers the Delete button.
 *
 * {@code untouchedAssessments} are allotments nobody has begun (or that a
 * Reports Hub reset handed back): they are removed with the respondent.
 * {@code startedAssessments} hold real answers and BLOCK the delete until each
 * is reset — a delete never discards a finished attempt by itself.
 * {@code keepsLogin} is true when the identity row survives (a practitioner
 * profile, a role group or the superadmin flag still needs it), so only the
 * respondent profile goes.
 */
public record RespondentDeleteCheck(
        Long respondentUserId,
        List<String> untouchedAssessments,
        List<String> startedAssessments,
        long reportNarratives,
        boolean keepsLogin,
        boolean deletable) {
}
