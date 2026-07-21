package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.model.auth.PractitionerUser;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.model.auth.enums.PractitionerStatus;
import com.bodhpsychometric.model.auth.enums.Vertical;
import com.bodhpsychometric.model.organization.Organization;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * Flattened User identity + PractitionerUser profile for the dashboard.
 * dob is dd-MM-yyyy on the wire, matching PractitionerRequest.
 */
public record PractitionerResponse(
        Long practitionerUserId,
        Long userId,
        String serialId,
        String name,
        String email,
        @JsonFormat(pattern = "dd-MM-yyyy") LocalDate dob,
        String phone,
        PractitionerStatus practitionerStatus,
        Vertical vertical,
        boolean superAdmin,
        Long organizationId,
        String organizationName) {

    public static PractitionerResponse from(PractitionerUser practitioner) {
        User user = practitioner.getUser();
        Organization organization = practitioner.getOrganization();
        return new PractitionerResponse(
                practitioner.getId(),
                user.getId(),
                user.getSerialId(),
                practitioner.getName(),
                user.getEmail(),
                user.getDob(),
                practitioner.getPhone(),
                practitioner.getPractitionerStatus(),
                practitioner.getVertical(),
                user.isSuperAdmin(),
                organization == null ? null : organization.getOrganizationId(),
                organization == null ? null : organization.getName());
    }
}
