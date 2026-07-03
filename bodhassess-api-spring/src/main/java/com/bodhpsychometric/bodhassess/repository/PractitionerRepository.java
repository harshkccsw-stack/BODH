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

    @Query("SELECT p FROM Practitioner p WHERE LOWER(p.email) = LOWER(:email) AND p.dob = :dob AND p.status = 'Active'")
    Optional<Practitioner> findActiveByEmailAndDob(@Param("email") String email, @Param("dob") LocalDate dob);

    // Phone match is digits-only — the stored phone may carry separators (+,
    // space, dash, parens), so we filter candidates by DOB+status in SQL and
    // do the final digit comparison in Java.
    @Query("SELECT p FROM Practitioner p WHERE p.dob = :dob AND p.status = 'Active' AND p.phone IS NOT NULL")
    List<Practitioner> findActiveByDobWithPhone(@Param("dob") LocalDate dob);
}
