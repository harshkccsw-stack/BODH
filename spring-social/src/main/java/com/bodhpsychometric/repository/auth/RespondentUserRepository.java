
package com.bodhpsychometric.repository.auth;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    /** Portal sign-in fetch — user + organization eagerly, so the auth DTO never lazy-loads. */
    @Query("select r from RespondentUser r join fetch r.user u left join fetch r.organization where u.id = :userId")
    Optional<RespondentUser> findByUserIdForPortal(Long userId);

    // ── Organization membership (respondents are an org's "members") ──────
    long countByOrganization_OrganizationId(Long organizationId);

    boolean existsByOrganization_OrganizationId(Long organizationId);

    /** Detail fetch — user eagerly, so member refs never lazy-load per row. */
    @Query("select r from RespondentUser r join fetch r.user where r.organization.organizationId = :organizationId")
    List<RespondentUser> findForOrganizationDetail(Long organizationId);

    /** Everyone not yet in an org — feeds the org page's assign picker. */
    @Query("select r from RespondentUser r join fetch r.user where r.organization is null")
    List<RespondentUser> findUnassignedForPicker();

    /**
     * Report listing — every filter is optional: organizationId (null = all
     * orgs), assessmentId (null = all; set = only respondents holding at
     * least one attempt of it), search (pre-lowercased %pattern% against
     * name/email, or null). Ordered in the query, so pass an unsorted page.
     */
    @Query(value = "select r from RespondentUser r join fetch r.user u left join fetch r.organization o "
            + "where (:organizationId is null or o.organizationId = :organizationId) "
            + "and (:assessmentId is null or exists (select m from RespondentAssessmentMapping m "
            + "where m.respondent = r and m.assessment.assessmentId = :assessmentId)) "
            + "and (:search is null or lower(r.name) like :search or lower(u.email) like :search) "
            + "order by r.name, r.id",
            countQuery = "select count(r) from RespondentUser r join r.user u left join r.organization o "
            + "where (:organizationId is null or o.organizationId = :organizationId) "
            + "and (:assessmentId is null or exists (select m from RespondentAssessmentMapping m "
            + "where m.respondent = r and m.assessment.assessmentId = :assessmentId)) "
            + "and (:search is null or lower(r.name) like :search or lower(u.email) like :search)")
    Page<RespondentUser> findForReport(Long organizationId,
            Long assessmentId, String search, Pageable pageable);
}
