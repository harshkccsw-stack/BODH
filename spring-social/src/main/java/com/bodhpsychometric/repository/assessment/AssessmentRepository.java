package com.bodhpsychometric.repository.assessment;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;

public interface AssessmentRepository extends JpaRepository<Assessment, Long> {

    long countByQuestionnaireQuestionnaireId(Long questionnaireId);

    /** Report dropdown — paged search by name. */
    Page<Assessment> findByNameContainingIgnoreCase(String name, Pageable pageable);

    /**
     * Public catalog listing. The questionnaire carries every piece of
     * buyer-facing copy, and it is LAZY with open-in-view off — so it is
     * fetch-joined here rather than walked one row at a time.
     */
    @Query("select a from Assessment a join fetch a.questionnaire "
            + "where a.status = :status order by a.name asc")
    List<Assessment> findByStatusWithQuestionnaire(@Param("status") AssessmentStatus status);

    /**
     * Public catalog detail. Status is part of the lookup, so an INACTIVE
     * assessment is a 404 rather than something reachable by guessing an id.
     */
    @Query("select a from Assessment a join fetch a.questionnaire "
            + "where a.assessmentId = :id and a.status = :status")
    Optional<Assessment> findByIdAndStatusWithQuestionnaire(@Param("id") Long id,
            @Param("status") AssessmentStatus status);
}
