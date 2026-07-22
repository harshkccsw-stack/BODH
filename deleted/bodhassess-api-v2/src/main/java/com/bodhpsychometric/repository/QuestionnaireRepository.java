package com.bodhpsychometric.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.questionnaire.Questionnaire;

public interface QuestionnaireRepository extends JpaRepository<Questionnaire, Long> {

    List<Questionnaire> findByDeletedAtIsNullOrderByNameAsc();

    Optional<Questionnaire> findByIdAndDeletedAtIsNull(Long id);

    List<Questionnaire> findByDeletedAtIsNotNull();

    /** Org-owned questionnaires; platform-global ones have organization = null. */
    List<Questionnaire> findByOrganizationIdAndDeletedAtIsNullOrderByNameAsc(Long organizationId);

    List<Questionnaire> findByOrganizationIsNullAndDeletedAtIsNullOrderByNameAsc();

    List<Questionnaire> findByNameContainingIgnoreCaseAndDeletedAtIsNull(String name);
}
