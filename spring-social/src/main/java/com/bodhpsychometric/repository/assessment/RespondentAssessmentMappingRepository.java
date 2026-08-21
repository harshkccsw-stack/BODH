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

    /**
     * The allotment itself, not just whether it exists — self-registration
     * needs its id to send the respondent straight into the attempt, and a
     * returning respondent must be sent to the row they already hold rather
     * than a second one (the unique key forbids that anyway).
     */
    java.util.Optional<RespondentAssessmentMapping>
            findByRespondent_IdAndAssessment_AssessmentId(Long respondentUserId, Long assessmentId);

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

    /**
     * Live Tracking base list — a flat projection, deliberately NOT an entity
     * fetch: the tracking poll re-runs this every few seconds (behind a short
     * in-process cache), so it must be one cheap indexed query with nothing
     * lazy behind it. All joins are M:1 — no row fan-out. Unordered: the
     * caller sorts by Redis-derived liveness, which SQL cannot see.
     */
    @Query("select new com.bodhpsychometric.dto.LiveTrackingBaseRow("
            + "m.respondentAssessmentMappingId, m.assessmentStatus, u.id, r.name, u.email, u.serialId, "
            + "o.organizationId, o.name, a.assessmentId, a.name, q.questionnaireId) "
            + "from RespondentAssessmentMapping m "
            + "join m.respondent r join r.user u left join r.organization o "
            + "join m.assessment a join a.questionnaire q "
            + "where (:organizationId is null or o.organizationId = :organizationId) "
            + "and (:assessmentId is null or a.assessmentId = :assessmentId)")
    List<com.bodhpsychometric.dto.LiveTrackingBaseRow> findForLiveTracking(
            Long organizationId, Long assessmentId);

    /**
     * Export rows: the COMPLETED allotments for one assessment, with respondent
     * identity fetched. Both optional filters narrow it — an organizationId
     * scopes to that org's members (respondents with no org are excluded), a
     * respondentUserId picks the single respondent's row. Ordered by name so
     * the sheet is stable. Only COMPLETED attempts have a settled answer set.
     */
    @Query("select m from RespondentAssessmentMapping m "
            + "join fetch m.respondent r join fetch r.user left join fetch r.organization o "
            + "where m.assessment.assessmentId = :assessmentId "
            + "and m.assessmentStatus = com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus.COMPLETED "
            + "and (:organizationId is null or o.organizationId = :organizationId) "
            + "and (:respondentUserId is null or r.id = :respondentUserId) "
            + "order by r.name asc, r.id asc")
    List<RespondentAssessmentMapping> findCompletedForExport(Long assessmentId, Long organizationId,
            Long respondentUserId);

    /**
     * Data Studio rows: EVERY allotment for one assessment, whatever state the
     * attempt is in, with respondent identity fetched. Deliberately not the
     * COMPLETED-only fetch above — an analyst asking "what is our completion
     * rate" or "who has not started" needs the unfinished rows present, and a
     * sheet that silently dropped them would answer both questions wrong. The
     * scores on those rows come back blank rather than zero, so nothing they
     * contribute pollutes an average.
     *
     * <p>An organizationId narrows to that org's members (respondents with no
     * org are then excluded). Ordered by name so the sheet is stable across
     * reloads — a grid whose rows reshuffle under an edit is unusable.
     */
    @Query("select m from RespondentAssessmentMapping m "
            + "join fetch m.respondent r join fetch r.user left join fetch r.organization o "
            + "where m.assessment.assessmentId = :assessmentId "
            + "and (:organizationId is null or o.organizationId = :organizationId) "
            + "order by r.name asc, r.id asc")
    List<RespondentAssessmentMapping> findAllForDataStudio(Long assessmentId, Long organizationId);
}
