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
     * How many demographic FIELDS one respondent answered per assessment — the
     * report info popup, in one query for the whole popup. Distinct fields,
     * not rows: a checklist stores one row per tick (V39), and three ticks are
     * still one answered field.
     */
    @Query("select d.assessment.assessmentId, count(distinct d.demographicField.demographicFieldId) "
            + "from DemographicResponse d "
            + "where d.respondent.id = :respondentUserId group by d.assessment.assessmentId")
    List<Object[]> tallyDemographicsByAssessment(Long respondentUserId);

    /**
     * Every value anyone has given this field, across all assessments — what
     * a field edit checks before it lets an option be renamed or removed.
     * Only read when an edit actually drops a choice, which is rare.
     */
    @Query("select distinct d.responseValue from DemographicResponse d "
            + "where d.demographicField.demographicFieldId = :demographicFieldId")
    List<String> findAnsweredValues(Long demographicFieldId);

    /**
     * Export fetch — every demographic response of the given respondents for
     * one assessment, with the field eager so the sheet builder can key each
     * value by demographicFieldId without a lazy load.
     */
    @Query("select d from DemographicResponse d join fetch d.demographicField "
            + "where d.assessment.assessmentId = :assessmentId "
            + "and d.respondent.id in :respondentUserIds")
    List<DemographicResponse> findForExport(Long assessmentId, List<Long> respondentUserIds);
}
