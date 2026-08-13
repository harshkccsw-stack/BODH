package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;

/**
 * Every link an organization COULD have, in the shape the wizard's step 3
 * draws: one org-wide row plus one row per mapped assessment, each carrying
 * its link or null when none has been minted yet.
 *
 * Returning the un-minted rows too is the point — the page needs to offer
 * "Generate" against a target that has no link, and doing that from a list of
 * existing links alone would mean the dashboard re-deriving the catalog and
 * subtracting. The server already knows both halves.
 */
public record OrganizationRegistrationLinksResponse(
        Long organizationId,
        String organizationName,
        /** The whole-organization link, or null until one is generated. */
        RegistrationLinkResponse organizationLink,
        List<AssessmentLink> assessments) {

    /** One catalog entry and the link that points at it, if any. */
    public record AssessmentLink(
            Long assessmentId,
            String assessmentName,
            /** INACTIVE assessments still list — their link just will not resolve. */
            AssessmentStatus assessmentStatus,
            RegistrationLinkResponse link) {
    }
}
