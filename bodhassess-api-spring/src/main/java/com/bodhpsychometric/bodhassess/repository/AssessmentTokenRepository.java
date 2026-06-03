package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.AssessmentToken;

@Repository
public interface AssessmentTokenRepository extends JpaRepository<AssessmentToken, String> {

    @Query("SELECT t FROM AssessmentToken t WHERE t.assessmentId = :aid ORDER BY t.createdAt DESC")
    List<AssessmentToken> findByAssessmentId(@Param("aid") String assessmentId);

    // Idempotent reuse: find a live token already issued for the exact same
    // (assessment, entity, group, respondent) scope so the copy-link popup
    // returns the existing link instead of minting a new one each click.
    // Null-safe scope matching: a null param must match a null column.
    // Newest first — the service picks the first one that is still usable.
    @Query("SELECT t FROM AssessmentToken t WHERE t.assessmentId = :aid "
         + "AND ((:eid IS NULL AND t.entityId IS NULL) OR t.entityId = :eid) "
         + "AND ((:gid IS NULL AND t.groupId IS NULL) OR t.groupId = :gid) "
         + "AND ((:rid IS NULL AND t.respondentId IS NULL) OR t.respondentId = :rid) "
         + "ORDER BY t.createdAt DESC")
    List<AssessmentToken> findByScope(@Param("aid") String assessmentId,
                                      @Param("eid") String entityId,
                                      @Param("gid") String groupId,
                                      @Param("rid") String respondentId);
}
