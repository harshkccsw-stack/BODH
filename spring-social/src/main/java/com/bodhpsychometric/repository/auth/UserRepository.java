
package com.bodhpsychometric.repository.auth;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.auth.User;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailIgnoreCase(String email);

    /** Pre-checks for the unique email — never catch the flush instead. */
    boolean existsByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCaseAndIdNot(String email, Long id);

    /** Guard for revoke: the platform must never end up with zero superadmins. */
    long countBySuperAdminTrue();

}
