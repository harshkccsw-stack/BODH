package com.bodhpsychometric.model.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.auth.enums.OrganizationStatus;
import com.bodhpsychometric.model.auth.unnecessary.Organization;

public interface OrganizationRepository extends JpaRepository<Organization, Long> {

    List<Organization> findByDeletedAtIsNullOrderByNameAsc();

    Optional<Organization> findByIdAndDeletedAtIsNull(Long id);

    List<Organization> findByDeletedAtIsNotNull();

    /** PENDING = self-signups awaiting admin approval. */
    List<Organization> findByStatusAndDeletedAtIsNullOrderByCreatedAtDesc(OrganizationStatus status);

    List<Organization> findByNameContainingIgnoreCaseAndDeletedAtIsNull(String name);
}
