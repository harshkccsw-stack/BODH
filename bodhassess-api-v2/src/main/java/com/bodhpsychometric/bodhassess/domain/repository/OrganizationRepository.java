package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.people.Organization;
import com.bodhpsychometric.bodhassess.domain.people.OrganizationStatus;

public interface OrganizationRepository extends JpaRepository<Organization, Long> {

    List<Organization> findByDeletedAtIsNullOrderByNameAsc();

    Optional<Organization> findByIdAndDeletedAtIsNull(Long id);

    List<Organization> findByDeletedAtIsNotNull();

    /** PENDING = self-signups awaiting admin approval. */
    List<Organization> findByStatusAndDeletedAtIsNullOrderByCreatedAtDesc(OrganizationStatus status);

    List<Organization> findByNameContainingIgnoreCaseAndDeletedAtIsNull(String name);
}
