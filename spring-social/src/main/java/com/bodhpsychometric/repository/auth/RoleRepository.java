package com.bodhpsychometric.repository.auth;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.auth.Role;

public interface RoleRepository extends JpaRepository<Role, Long> {

    /** Pre-checks for the unique name — never catch the flush instead. */
    boolean existsByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCaseAndIdNot(String name, Long id);

    /**
     * Listing fetch. The distinct matters: fetch-joining urlPaths multiplies
     * the role row once per path, and without it the list repeats roles.
     */
    @Query("select distinct r from Role r left join fetch r.urlPaths order by r.name")
    List<Role> findAllForListing();

    @Query("select distinct r from Role r left join fetch r.urlPaths where r.id = :id")
    Optional<Role> findForDetail(Long id);
}
