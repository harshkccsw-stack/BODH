package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.AssessmentGroupAllotment;
import com.bodhpsychometric.bodhassess.model.AssessmentGroupAllotmentId;

@Repository
public interface AssessmentGroupAllotmentRepository
        extends JpaRepository<AssessmentGroupAllotment, AssessmentGroupAllotmentId> {

    @Query("SELECT a FROM AssessmentGroupAllotment a WHERE a.assessmentId = :aid")
    List<AssessmentGroupAllotment> findByAssessmentId(@Param("aid") String assessmentId);
}
