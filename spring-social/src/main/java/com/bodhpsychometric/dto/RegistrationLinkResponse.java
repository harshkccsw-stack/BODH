package com.bodhpsychometric.dto;

import java.time.OffsetDateTime;

import com.bodhpsychometric.dto.RegistrationTokenDetailResponse.Scope;
import com.bodhpsychometric.model.organization.RegistrationToken;
import com.bodhpsychometric.model.organization.enums.RegistrationTokenStatus;

/**
 * One minted link, as the ADMIN sees it — the counterpart to
 * RegistrationTokenDetailResponse, which is what the respondent's public page
 * gets. This one carries the lifecycle facts (status, uses, expiry) that are
 * deliberately withheld from the public endpoint.
 *
 * Only the bare token is sent, never a URL: the portal's origin is a
 * deployment fact the backend has no business knowing. The dashboard composes
 * `${VITE_PORTAL_URL}/register/{token}` from its own env.
 */
public record RegistrationLinkResponse(
        Long registrationTokenId,
        String token,
        Scope scope,
        Long assessmentId,
        String assessmentName,
        RegistrationTokenStatus status,
        Integer maxUses,
        int usedCount,
        OffsetDateTime expiresAt,
        OffsetDateTime createdAt) {

    /**
     * Must be called inside the transaction that loaded the row — an
     * assessment-scoped link reaches through its mapping for the assessment,
     * and open-in-view is off.
     */
    public static RegistrationLinkResponse from(RegistrationToken link) {
        boolean orgWide = link.isOrganizationWide();
        return new RegistrationLinkResponse(
                link.getRegistrationTokenId(),
                link.getToken(),
                orgWide ? Scope.ORGANIZATION : Scope.ASSESSMENT,
                orgWide ? null
                        : link.getOrganizationAssessmentMapping().getAssessment().getAssessmentId(),
                orgWide ? null
                        : link.getOrganizationAssessmentMapping().getAssessment().getName(),
                link.getStatus(),
                link.getMaxUses(),
                link.getUsedCount(),
                link.getExpiresAt(),
                link.getCreatedAt());
    }
}
