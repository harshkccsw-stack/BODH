package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.AssessmentRespondentAllotment;
import com.bodhpsychometric.bodhassess.model.AssessmentRespondentAllotmentId;

@Repository
public interface AssessmentRespondentAllotmentRepository
        extends JpaRepository<AssessmentRespondentAllotment, AssessmentRespondentAllotmentId> {

    @Query("SELECT a FROM AssessmentRespondentAllotment a WHERE a.assessmentId = :aid")
    List<AssessmentRespondentAllotment> findByAssessmentId(@Param("aid") String assessmentId);
}
