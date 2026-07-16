package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.bodhassess.domain.people.User;
import com.bodhpsychometric.bodhassess.domain.people.UserStatus;

public interface UserRepository extends JpaRepository<User, Long> {

    /** Login lookup — email is the canonical identifier. */
    Optional<User> findByEmailIgnoreCaseAndDeletedAtIsNull(String email);

    boolean existsByEmailIgnoreCase(String email);

    Optional<User> findByIdAndDeletedAtIsNull(Long id);

    List<User> findByDeletedAtIsNull();

    List<User> findByStatusAndDeletedAtIsNull(UserStatus status);

    /** All live users holding a role (e.g. every practitioner). */
    @Query("select distinct u from User u join u.roles ur"
            + " where ur.role.name = :roleName and u.deletedAt is null")
    List<User> findByRoleName(@Param("roleName") String roleName);

    List<User> findByNameContainingIgnoreCaseAndDeletedAtIsNull(String name);
}
