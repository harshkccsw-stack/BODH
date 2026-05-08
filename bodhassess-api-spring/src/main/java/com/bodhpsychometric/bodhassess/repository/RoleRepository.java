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

    @Query(value = "SELECT url_paths FROM roles WHERE name IN (:names)", nativeQuery = true)
    List<String> findUrlPathsJsonByRoleNames(java.util.Collection<String> names);
}
