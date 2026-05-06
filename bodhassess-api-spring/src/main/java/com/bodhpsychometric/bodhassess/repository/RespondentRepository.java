package com.bodhpsychometric.bodhassess.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.Respondent;

@Repository
public interface RespondentRepository extends JpaRepository<Respondent, String> {

    @Query("SELECT r FROM Respondent r ORDER BY r.createdAt DESC")
    List<Respondent> findAllOrderByCreatedAt();

    @Query("SELECT r FROM Respondent r WHERE LOWER(r.id) = LOWER(:id) AND r.dob = :dob")
    Optional<Respondent> findByIdAndDob(@Param("id") String id, @Param("dob") String dob);
}
