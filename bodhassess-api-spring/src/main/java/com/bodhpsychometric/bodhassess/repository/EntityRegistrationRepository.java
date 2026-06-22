package com.bodhpsychometric.bodhassess.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.EntityRegistration;

@Repository
public interface EntityRegistrationRepository extends JpaRepository<EntityRegistration, String> {

    @Query("SELECT e FROM EntityRegistration e ORDER BY e.createdAt DESC")
    List<EntityRegistration> findAllOrderByCreatedAtDesc();

    Optional<EntityRegistration> findByEmail(String email);

    /** Entities whose stored assessments allow-list still references the given
     *  assessment id. Used to scrub the denormalised entity_assessments set
     *  when an assessment is deleted, so it stops counting toward access. */
    @Query("SELECT e FROM EntityRegistration e JOIN e.assessments a WHERE a = :assessmentId")
    List<EntityRegistration> findByAssessmentId(@Param("assessmentId") String assessmentId);
}
