package com.bodhpsychometric.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.AssessmentStatus;

public interface AssessmentRepository extends JpaRepository<Assessment, Long> {

    List<Assessment> findByDeletedAtIsNullOrderByCreatedAtDesc();

    Optional<Assessment> findByIdAndDeletedAtIsNull(Long id);

    List<Assessment> findByDeletedAtIsNotNull();

    List<Assessment> findByStatusAndDeletedAtIsNull(AssessmentStatus status);

    /** Guard for questionnaire edits: are non-closed assessments reading it live? */
    List<Assessment> findByQuestionnaireIdAndStatusNotAndDeletedAtIsNull(
            Long questionnaireId, AssessmentStatus status);

    List<Assessment> findByQuestionnaireIdAndDeletedAtIsNull(Long questionnaireId);
}
