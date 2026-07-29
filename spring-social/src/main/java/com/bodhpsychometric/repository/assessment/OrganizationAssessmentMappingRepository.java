package com.bodhpsychometric.repository.assessment;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.assessment.OrganizationAssessmentMapping;

public interface OrganizationAssessmentMappingRepository
        extends JpaRepository<OrganizationAssessmentMapping, Long> {

    /** Org catalog fetch — assessment + questionnaire eagerly for the DTO. */
    @Query("select m from OrganizationAssessmentMapping m "
            + "join fetch m.assessment a join fetch a.questionnaire "
            + "where m.organization.organizationId = :organizationId")
    List<OrganizationAssessmentMapping> findForOrganizationCatalog(Long organizationId);

    boolean existsByOrganization_OrganizationIdAndAssessment_AssessmentId(
            Long organizationId, Long assessmentId);

    long countByOrganization_OrganizationId(Long organizationId);

    /** Org delete cleans its catalog rows; assessment delete mirrors this. */
    void deleteByOrganization_OrganizationId(Long organizationId);

    void deleteByAssessment_AssessmentId(Long assessmentId);
}
