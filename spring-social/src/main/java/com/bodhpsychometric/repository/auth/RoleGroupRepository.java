package com.bodhpsychometric.repository.auth;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.auth.RoleGroup;

public interface RoleGroupRepository extends JpaRepository<RoleGroup, Long> {

    /** Pre-checks for the unique name — never catch the flush instead. */
    boolean existsByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCaseAndRoleGroupIdNot(String name, Long roleGroupId);

    /** Delete guard for a role: is it still bundled into any group? */
    boolean existsByRoles_Id(Long roleId);

    long countByRoles_Id(Long roleId);

    /**
     * Listing fetch — roles only. Their urlPaths are left lazy on purpose:
     * fetch-joining a second collection would build a cartesian product, and
     * the response's merged path union loads them one role at a time inside
     * the controller's transaction. Roles and groups are tiny tables, so the
     * extra selects cost less than the product would.
     */
    @Query("select distinct g from RoleGroup g left join fetch g.roles order by g.name")
    List<RoleGroup> findAllForListing();

    @Query("select distinct g from RoleGroup g left join fetch g.roles where g.roleGroupId = :id")
    Optional<RoleGroup> findForDetail(Long id);
}
