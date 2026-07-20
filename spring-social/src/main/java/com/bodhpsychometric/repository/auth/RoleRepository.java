package com.bodhpsychometric.repository.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.auth.Role;

public interface RoleRepository extends JpaRepository<Role, Long> {

}
