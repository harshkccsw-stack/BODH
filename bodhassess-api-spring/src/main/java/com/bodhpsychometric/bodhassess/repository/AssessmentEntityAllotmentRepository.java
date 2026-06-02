package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.AssessmentEntityAllotment;
import com.bodhpsychometric.bodhassess.model.AssessmentEntityAllotmentId;

@Repository
public interface AssessmentEntityAllotmentRepository
        extends JpaRepository<AssessmentEntityAllotment, AssessmentEntityAllotmentId> {

    @Query("SELECT a FROM AssessmentEntityAllotment a WHERE a.assessmentId = :aid")
    List<AssessmentEntityAllotment> findByAssessmentId(@Param("aid") String assessmentId);

    @Query("SELECT a FROM AssessmentEntityAllotment a WHERE a.entityId = :eid")
    List<AssessmentEntityAllotment> findByEntityId(@Param("eid") String entityId);
}
