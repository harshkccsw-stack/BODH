package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.PortalSession;
import com.bodhpsychometric.bodhassess.payload.AssessmentSummaryDto;

@Repository
public interface PortalSessionRepository extends JpaRepository<PortalSession, String> {

    @Query("SELECT s FROM PortalSession s ORDER BY s.createdAt DESC")
    List<PortalSession> findAllOrderByCreated();

    @Query("SELECT s FROM PortalSession s WHERE s.respondentId = :rid ORDER BY s.createdAt DESC")
    List<PortalSession> findByRespondentId(@Param("rid") String rid);

    // Slim projection for list views (dashboard "Recent Assessments", etc.)
    // — only the fields rendered in the table. Pulls a single row per
    // session and skips the answers/mqtScores/demographics child collections
    // entirely. SELECT new ... requires the matching constructor on the DTO.
    @Query("SELECT new com.bodhpsychometric.bodhassess.payload.AssessmentSummaryDto("
         + "s.id, s.assessmentId, s.name, s.respondentName, s.instrument, s.vertical, s.status, s.score, s.createdAt, s.completedAt) "
         + "FROM PortalSession s ORDER BY s.createdAt DESC")
    List<AssessmentSummaryDto> findAllSummariesOrderByCreated();

    @Query("SELECT new com.bodhpsychometric.bodhassess.payload.AssessmentSummaryDto("
         + "s.id, s.assessmentId, s.name, s.respondentName, s.instrument, s.vertical, s.status, s.score, s.createdAt, s.completedAt) "
         + "FROM PortalSession s WHERE s.respondentId = :rid ORDER BY s.createdAt DESC")
    List<AssessmentSummaryDto> findSummariesByRespondentId(@Param("rid") String rid);

    // Filter sessions by the group key set when admin creates an assessment
    // in bulk. Drives the /assessments/:assessmentId/respondents page.
    @Query("SELECT new com.bodhpsychometric.bodhassess.payload.AssessmentSummaryDto("
         + "s.id, s.assessmentId, s.name, s.respondentName, s.instrument, s.vertical, s.status, s.score, s.createdAt, s.completedAt) "
         + "FROM PortalSession s WHERE s.assessmentId = :aid ORDER BY s.createdAt DESC")
    List<AssessmentSummaryDto> findSummariesByAssessmentId(@Param("aid") String assessmentId);

    // Tally helpers for the first-class Assessment view + per-(entity,
    // assessment) cap enforcement. Plain COUNT queries — no joins, no
    // child collections fetched.
    @Query("SELECT COUNT(s) FROM PortalSession s WHERE s.assessmentId = :aid")
    long countByAssessmentId(@Param("aid") String assessmentId);

    @Query("SELECT COUNT(s) FROM PortalSession s WHERE s.assessmentId = :aid AND s.status = :status")
    long countByAssessmentIdAndStatus(@Param("aid") String assessmentId, @Param("status") String status);

    // The entity-scoped session count powers the cap check before fan-out.
    // We rely on portal_sessions carrying an entity_id when the session
    // was created via an entity allotment.
    @Query("SELECT COUNT(s) FROM PortalSession s WHERE s.assessmentId = :aid AND s.entityId = :eid")
    long countByAssessmentIdAndEntityId(@Param("aid") String assessmentId, @Param("eid") String entityId);

    // Grouped view: one row per assessmentId, with aggregate counts. Used
    // by the All Assessments table so admins see one row per allotment
    // rather than one row per respondent.
    @Query("SELECT new com.bodhpsychometric.bodhassess.payload.AssessmentGroupDto("
         + "s.assessmentId, "
         + "MAX(s.name), MAX(s.instrument), MAX(s.instrumentFullName), MAX(s.vertical), MAX(s.language), "
         + "MAX(s.createdAt), "
         + "COUNT(s), "
         + "SUM(CASE WHEN s.status = 'Completed' THEN 1 ELSE 0 END), "
         + "SUM(CASE WHEN s.status = 'Active' THEN 1 ELSE 0 END), "
         + "SUM(CASE WHEN s.status = 'Pending Review' THEN 1 ELSE 0 END)) "
         + "FROM PortalSession s WHERE s.assessmentId IS NOT NULL "
         + "GROUP BY s.assessmentId ORDER BY MAX(s.createdAt) DESC")
    List<com.bodhpsychometric.bodhassess.payload.AssessmentGroupDto> findAssessmentGroups();

    @Query("SELECT s FROM PortalSession s "
         + "WHERE s.instrument = :instrument "
         + "AND ((:groupId IS NULL AND s.groupId IS NULL) OR s.groupId = :groupId) "
         + "ORDER BY s.createdAt DESC")
    List<PortalSession> findByInstrumentAndGroup(@Param("instrument") String instrument,
                                                 @Param("groupId") String groupId);

    @Query("SELECT new com.bodhpsychometric.bodhassess.payload.LiveAssessmentSummary("
         + "  s.instrument, s.instrumentFullName, s.groupId, s.groupName, "
         + "  COUNT(s), "
         + "  SUM(CASE WHEN s.status = 'Completed' THEN 1 ELSE 0 END)) "
         + "FROM PortalSession s "
         + "GROUP BY s.instrument, s.instrumentFullName, s.groupId, s.groupName "
         + "ORDER BY s.instrumentFullName, s.groupName")
    List<com.bodhpsychometric.bodhassess.payload.LiveAssessmentSummary> findAssessmentSummaries();
}
