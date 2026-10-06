package com.bodhpsychometric.repository.assessment;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.assessment.Assessment;

public interface AssessmentRepository extends JpaRepository<Assessment, Long> {

    long countByQuestionnaireQuestionnaireId(Long questionnaireId);

    /** Report dropdown — paged search by name. */
    Page<Assessment> findByNameContainingIgnoreCase(String name, Pageable pageable);

    /**
     * Report dropdown scoped to one organization's catalog
     * (OrganizationAssessmentMapping) — paged, `search` a lowercased
     * `%pattern%` or null for every mapped assessment.
     */
    @Query("select a from Assessment a where exists (select m from OrganizationAssessmentMapping m "
            + "where m.assessment = a and m.organization.organizationId = :organizationId) "
            + "and (:search is null or lower(a.name) like :search)")
    Page<Assessment> findInOrganizationCatalog(Long organizationId, String search, Pageable pageable);
}
