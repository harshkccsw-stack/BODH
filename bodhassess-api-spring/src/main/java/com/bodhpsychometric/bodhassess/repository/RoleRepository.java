package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.Role;

@Repository
public interface RoleRepository extends JpaRepository<Role, String> {

    @Query("SELECT r FROM Role r ORDER BY r.name ASC")
    List<Role> findAllOrderByName();

    /**
     * URL paths flattened across the named roles. Replaces the legacy
     * roles.url_paths JSON column with a join through role_url_paths.
     */
    @Query(value = "SELECT DISTINCT rup.url_path FROM role_url_paths rup" +
            " JOIN roles r ON r.id = rup.role_id" +
            " WHERE r.name IN (:names)", nativeQuery = true)
    List<String> findUrlPathsByRoleNames(java.util.Collection<String> names);
}
