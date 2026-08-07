package com.bodhpsychometric.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;

import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.model.auth.enums.Gender;
import com.bodhpsychometric.model.organization.Organization;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * Flattened User identity + RespondentUser profile for the dashboard.
 * dob is dd-MM-yyyy on the wire, matching RespondentRequest.
 */
public record RespondentResponse(
        Long respondentUserId,
        Long userId,
        String serialId,
        String name,
        String email,
        @JsonFormat(pattern = "dd-MM-yyyy") LocalDate dob,
        String phone,
        /** Optional employer code — the alternative login identifier. */
        String employeeId,
        Gender gender,
        boolean isConsented,
        OffsetDateTime consentedAt,
        Long organizationId,
        String organizationName) {

    public static RespondentResponse from(RespondentUser respondent) {
        User user = respondent.getUser();
        Organization organization = respondent.getOrganization();
        return new RespondentResponse(
                respondent.getId(),
                user.getId(),
                user.getSerialId(),
                respondent.getName(),
                user.getEmail(),
                user.getDob(),
                respondent.getPhone(),
                respondent.getEmployeeId(),
                respondent.getGender(),
                respondent.isConsented(),
                respondent.getConsentedAt(),
                organization == null ? null : organization.getOrganizationId(),
                organization == null ? null : organization.getName());
    }
}
