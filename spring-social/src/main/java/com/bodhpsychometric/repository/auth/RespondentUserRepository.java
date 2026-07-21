
package com.bodhpsychometric.repository.auth;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.auth.RespondentUser;

public interface RespondentUserRepository extends JpaRepository<RespondentUser, Long> {

    /** All respondents belonging to an organization. */
    List<RespondentUser> findByOrganization_OrganizationId(Long organizationId);

    /** Listing fetch — user + organization eagerly, so DTO mapping never lazy-loads per row. */
    @Query("select r from RespondentUser r join fetch r.user left join fetch r.organization")
    List<RespondentUser> findAllForListing();

    /** Does this identity also hold a respondent profile? */
    boolean existsByUser_Id(Long userId);
}
