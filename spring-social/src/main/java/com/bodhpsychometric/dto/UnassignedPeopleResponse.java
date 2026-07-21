package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.dto.OrganizationDetailResponse.MemberRef;
import com.bodhpsychometric.dto.OrganizationDetailResponse.StaffRef;

/**
 * Everyone who belongs to no organization yet — what the org page's assign
 * picker lists. Same ref shapes as the org detail.
 */
public record UnassignedPeopleResponse(
        List<StaffRef> practitioners,
        List<MemberRef> respondents) {
}
