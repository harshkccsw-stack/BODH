package com.bodhpsychometric.bodhassess.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.User;

@Repository
public interface UserRepository extends JpaRepository<User, String> {

    @Query("SELECT u FROM User u WHERE LOWER(u.email) = LOWER(:email)")
    Optional<User> findByEmailIgnoreCase(@Param("email") String email);

    @Query("SELECT u FROM User u WHERE LOWER(u.email) = LOWER(:email) AND u.dob = :dob")
    Optional<User> findByEmailAndDob(@Param("email") String email, @Param("dob") String dob);
}
