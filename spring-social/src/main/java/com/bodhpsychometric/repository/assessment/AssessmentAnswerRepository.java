package com.bodhpsychometric.repository.assessment;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.assessment.AssessmentAnswer;

public interface AssessmentAnswerRepository extends JpaRepository<AssessmentAnswer, Long> {

    boolean existsByQuestionQuestionId(Long questionId);

    /** Any recorded answers freeze an attempt — pre-checked before unassign. */
    boolean existsByMapping_RespondentAssessmentMappingId(Long respondentAssessmentMappingId);
}
