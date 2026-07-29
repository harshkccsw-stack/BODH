package com.bodhpsychometric.repository.demographics;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.demographics.DemographicResponse;

public interface DemographicResponseRepository extends JpaRepository<DemographicResponse, Long> {

    boolean existsByDemographicFieldDemographicFieldId(Long demographicFieldId);

    /** Does this (respondent, assessment) pair hold a demographic set yet? */
    boolean existsByRespondent_IdAndAssessment_AssessmentId(Long respondentUserId, Long assessmentId);

    /** Replace-all write on begin, and cleanup when an allotment is removed. */
    @Modifying
    void deleteByRespondent_IdAndAssessment_AssessmentId(Long respondentUserId, Long assessmentId);

    /**
     * How many demographic answers one respondent holds per assessment — the
     * report info popup, in one query for the whole popup.
     */
    @Query("select d.assessment.assessmentId, count(d) from DemographicResponse d "
            + "where d.respondent.id = :respondentUserId group by d.assessment.assessmentId")
    List<Object[]> tallyDemographicsByAssessment(Long respondentUserId);
}
