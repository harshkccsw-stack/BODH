package com.bodhpsychometric.repository.assessment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;

import com.bodhpsychometric.model.assessment.AssessmentAnswer;

public interface AssessmentAnswerRepository extends JpaRepository<AssessmentAnswer, Long> {

    boolean existsByQuestionQuestionId(Long questionId);

    /** Does this (respondent, assessment) pair hold its answer set yet? */
    boolean existsByRespondent_IdAndAssessment_AssessmentId(Long respondentUserId, Long assessmentId);

    /** Replace-all support: clear the pair's set before writing the new one. */
    @Modifying
    void deleteByRespondent_IdAndAssessment_AssessmentId(Long respondentUserId, Long assessmentId);
}
