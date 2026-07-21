
package com.bodhpsychometric.repository.auth;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.auth.RespondentUser;

public interface RespondentUserRepository extends JpaRepository<RespondentUser, Long> {

    /** All respondents belonging to an organization. */
    List<RespondentUser> findByOrganization_OrganizationId(Long organizationId);
}
