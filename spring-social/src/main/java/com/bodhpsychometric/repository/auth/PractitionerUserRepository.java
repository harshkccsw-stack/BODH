
package com.bodhpsychometric.repository.auth;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.auth.PractitionerUser;

public interface PractitionerUserRepository extends JpaRepository<PractitionerUser, Long> {

    /** All practitioners belonging to an organization. */
    List<PractitionerUser> findByOrganization_OrganizationId(Long organizationId);

    /** Does this identity also hold a practitioner profile? */
    boolean existsByUser_Id(Long userId);

    /** Listing fetch — user + organization eagerly, so DTO mapping never lazy-loads per row. */
    @Query("select p from PractitionerUser p join fetch p.user left join fetch p.organization")
    List<PractitionerUser> findAllForListing();

    // ── Organization membership (practitioners are an org's "staff") ──────
    long countByOrganization_OrganizationId(Long organizationId);

    boolean existsByOrganization_OrganizationId(Long organizationId);

    /** Detail fetch — user eagerly, so staff refs never lazy-load per row. */
    @Query("select p from PractitionerUser p join fetch p.user where p.organization.organizationId = :organizationId")
    List<PractitionerUser> findForOrganizationDetail(Long organizationId);

    /** Everyone not yet in an org — feeds the org page's assign picker. */
    @Query("select p from PractitionerUser p join fetch p.user where p.organization is null")
    List<PractitionerUser> findUnassignedForPicker();
}
