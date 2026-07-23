package com.bodhpsychometric.repository.assessment;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.assessment.Assessment;

public interface AssessmentRepository extends JpaRepository<Assessment, Long> {

    long countByQuestionnaireQuestionnaireId(Long questionnaireId);

    /** Report dropdown — paged search by name. */
    Page<Assessment> findByNameContainingIgnoreCase(String name, Pageable pageable);
}
