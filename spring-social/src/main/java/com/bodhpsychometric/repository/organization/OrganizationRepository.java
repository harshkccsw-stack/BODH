package com.bodhpsychometric.repository.organization;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.organization.Organization;

public interface OrganizationRepository extends JpaRepository<Organization, Long> {

    /** Pre-checks for the unique name — never catch the flush instead. */
    boolean existsByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCaseAndOrganizationIdNot(String name, Long organizationId);
}
