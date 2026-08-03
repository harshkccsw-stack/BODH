package com.bodhpsychometric.repository.assessment;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.assessment.AssessmentAnswer;

public interface AssessmentAnswerRepository extends JpaRepository<AssessmentAnswer, Long> {

    boolean existsByQuestionQuestionId(Long questionId);

    /** Does this (respondent, assessment) pair hold its answer set yet? */
    boolean existsByRespondent_IdAndAssessment_AssessmentId(Long respondentUserId, Long assessmentId);

    /** Replace-all support: clear the pair's set before writing the new one. */
    @Modifying
    void deleteByRespondent_IdAndAssessment_AssessmentId(Long respondentUserId, Long assessmentId);

    /**
     * How many answers one respondent holds per assessment — the report info
     * popup's "answered n of m", in one query for the whole popup.
     */
    @Query("select a.assessment.assessmentId, count(a) from AssessmentAnswer a "
            + "where a.respondent.id = :respondentUserId group by a.assessment.assessmentId")
    List<Object[]> tallyAnswersByAssessment(Long respondentUserId);

    /**
     * Export fetch — every marked answer of the given respondents for one
     * assessment, with question and (nullable) option eager so the sheet
     * builder never lazy-loads. One row per selected option: multi-select and
     * ranking questions return several rows for the same question.
     */
    @Query("select a from AssessmentAnswer a "
            + "join fetch a.question left join fetch a.option o "
            + "where a.assessment.assessmentId = :assessmentId "
            + "and a.respondent.id in :respondentUserIds "
            + "order by o.sortOrder asc, a.assessmentAnswerId asc")
    List<AssessmentAnswer> findForExport(Long assessmentId, List<Long> respondentUserIds);
}
