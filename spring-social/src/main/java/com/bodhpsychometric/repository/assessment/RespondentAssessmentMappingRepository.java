package com.bodhpsychometric.repository.assessment;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;

public interface RespondentAssessmentMappingRepository extends JpaRepository<RespondentAssessmentMapping, Long> {

    long countByAssessmentAssessmentId(Long assessmentId);

    /** Allotments block respondent deletion — pre-checked, never caught. */
    boolean existsByRespondent_Id(Long respondentUserId);

    /** Already assigned? One allotment per pair is the rule. */
    boolean existsByRespondent_IdAndAssessment_AssessmentId(Long respondentUserId, Long assessmentId);

    /** Allotments by one org's members for one assessment — blocks org unmapping. */
    long countByAssessment_AssessmentIdAndRespondent_Organization_OrganizationId(
            Long assessmentId, Long organizationId);

    /** Listing fetch — everything the assignment views render, no lazy loads. */
    @Query("select m from RespondentAssessmentMapping m "
            + "join fetch m.respondent r join fetch r.user left join fetch r.organization "
            + "join fetch m.assessment")
    List<RespondentAssessmentMapping> findAllForListing();

    @Query("select m from RespondentAssessmentMapping m "
            + "join fetch m.respondent r join fetch r.user left join fetch r.organization "
            + "join fetch m.assessment a where a.assessmentId = :assessmentId")
    List<RespondentAssessmentMapping> findByAssessmentForListing(Long assessmentId);

    @Query("select m from RespondentAssessmentMapping m "
            + "join fetch m.respondent r join fetch r.user left join fetch r.organization "
            + "join fetch m.assessment where r.id = :respondentUserId")
    List<RespondentAssessmentMapping> findByRespondentForListing(Long respondentUserId);

    /**
     * Allotment tallies for one report page: respondentUserId → [count(all),
     * count(completed)], optionally scoped to one assessment. Callers must
     * skip the call for an empty id list.
     */
    @Query("select m.respondent.id, count(m), "
            + "sum(case when m.assessmentStatus = com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus.COMPLETED then 1 else 0 end) "
            + "from RespondentAssessmentMapping m "
            + "where m.respondent.id in :respondentUserIds "
            + "and (:assessmentId is null or m.assessment.assessmentId = :assessmentId) "
            + "group by m.respondent.id")
    List<Object[]> tallyAssignmentsForReport(List<Long> respondentUserIds, Long assessmentId);

    /**
     * Report info popup — one respondent's allotments with the assessment and
     * its questionnaire fetched, so the row DTO never lazy-loads. Ordered by
     * assessment name to match the rest of the reports area.
     */
    @Query("select m from RespondentAssessmentMapping m "
            + "join fetch m.assessment a join fetch a.questionnaire "
            + "where m.respondent.id = :respondentUserId order by a.name, a.assessmentId")
    List<RespondentAssessmentMapping> findForReportDetail(Long respondentUserId);

    /** Reset fetch — the single allotment with everything the response row needs. */
    @Query("select m from RespondentAssessmentMapping m "
            + "join fetch m.respondent r join fetch r.user "
            + "join fetch m.assessment a join fetch a.questionnaire "
            + "where m.respondentAssessmentMappingId = :id")
    Optional<RespondentAssessmentMapping> findForReportReset(Long id);

    /** Portal take-flow fetch — allotment + assessment + questionnaire in one go. */
    @Query("select m from RespondentAssessmentMapping m join fetch m.respondent "
            + "join fetch m.assessment a join fetch a.questionnaire "
            + "where m.respondentAssessmentMappingId = :id")
    Optional<RespondentAssessmentMapping> findForPortalDelivery(Long id);
}
