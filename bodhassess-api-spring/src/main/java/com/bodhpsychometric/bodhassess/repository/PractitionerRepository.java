package com.bodhpsychometric.bodhassess.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.Practitioner;

@Repository
public interface PractitionerRepository extends JpaRepository<Practitioner, String> {

    @Query("SELECT p FROM Practitioner p ORDER BY p.createdAt DESC")
    List<Practitioner> findAllOrderByCreatedAt();

    @Query("SELECT p FROM Practitioner p WHERE LOWER(p.id) = LOWER(:id) AND p.dob = :dob AND p.status = 'Active'")
    Optional<Practitioner> findActiveByIdAndDob(@Param("id") String id, @Param("dob") LocalDate dob);
}
