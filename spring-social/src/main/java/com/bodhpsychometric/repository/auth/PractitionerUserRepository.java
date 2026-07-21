
package com.bodhpsychometric.repository.auth;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.auth.PractitionerUser;

public interface PractitionerUserRepository extends JpaRepository<PractitionerUser, Long> {

    /** All practitioners belonging to an organization. */
    List<PractitionerUser> findByOrganization_OrganizationId(Long organizationId);
}
