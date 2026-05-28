package com.bodhpsychometric.bodhassess.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.EntityRegistration;

@Repository
public interface EntityRegistrationRepository extends JpaRepository<EntityRegistration, String> {

    @Query("SELECT e FROM EntityRegistration e ORDER BY e.createdAt DESC")
    List<EntityRegistration> findAllOrderByCreatedAtDesc();

    Optional<EntityRegistration> findByEmail(String email);
}
