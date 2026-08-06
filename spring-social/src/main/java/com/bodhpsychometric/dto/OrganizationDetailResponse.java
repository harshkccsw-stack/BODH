package com.bodhpsychometric.dto;

import java.util.List;

import com.bodhpsychometric.model.auth.PractitionerUser;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.enums.PractitionerStatus;
import com.bodhpsychometric.model.organization.Organization;

/**
 * One organization drilled in: staff are its practitioners (the authority
 * side), members are its respondents (the assessed side). Read-only view —
 * assignment happens on the practitioner/respondent pages.
 */
public record OrganizationDetailResponse(
        Long organizationId,
        String name,
        String orgEmail,
        String description,
        String logoBase64,
        List<StaffRef> staff,
        List<MemberRef> members) {

    public record StaffRef(
            Long practitionerUserId,
            String serialId,
            String name,
            String email,
            PractitionerStatus practitionerStatus) {

        public static StaffRef from(PractitionerUser practitioner) {
            return new StaffRef(
                    practitioner.getId(),
                    practitioner.getUser().getSerialId(),
                    practitioner.getName(),
                    practitioner.getUser().getEmail(),
                    practitioner.getPractitionerStatus());
        }
    }

    public record MemberRef(
            Long respondentUserId,
            String serialId,
            String name,
            String email,
            boolean isConsented) {

        public static MemberRef from(RespondentUser respondent) {
            return new MemberRef(
                    respondent.getId(),
                    respondent.getUser().getSerialId(),
                    respondent.getName(),
                    respondent.getUser().getEmail(),
                    respondent.isConsented());
        }
    }

    public static OrganizationDetailResponse from(Organization organization,
            List<PractitionerUser> staff, List<RespondentUser> members) {
        return new OrganizationDetailResponse(
                organization.getOrganizationId(),
                organization.getName(),
                organization.getOrgEmail(),
                organization.getDescription(),
                organization.getLogoBase64(),
                staff.stream().map(StaffRef::from).toList(),
                members.stream().map(MemberRef::from).toList());
    }
}
