package com.bodhpsychometric.model.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.auth.unnecessary.RespondentGroup;

public interface RespondentGroupRepository extends JpaRepository<RespondentGroup, Long> {

    List<RespondentGroup> findByOrganizationIdAndDeletedAtIsNullOrderByNameAsc(Long organizationId);

    /** Top level of one org's group tree. */
    List<RespondentGroup> findByOrganizationIdAndParentIsNullAndDeletedAtIsNullOrderByNameAsc(Long organizationId);

    List<RespondentGroup> findByParentIdAndDeletedAtIsNull(Long parentId);

    Optional<RespondentGroup> findByIdAndDeletedAtIsNull(Long id);

    List<RespondentGroup> findByDeletedAtIsNotNull();
}
