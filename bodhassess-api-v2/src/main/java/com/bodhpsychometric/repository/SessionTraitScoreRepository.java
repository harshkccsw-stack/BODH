package com.bodhpsychometric.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.delivery.SessionTraitScore;

/**
 * Frozen results: written once by the server at submit, then read-only —
 * no service ever updates or deletes rows here (reset archives the whole
 * attempt instead).
 */
public interface SessionTraitScoreRepository extends JpaRepository<SessionTraitScore, Long> {

    List<SessionTraitScore> findByAttemptId(Long attemptId);

    /** Report fetch: scores with placement + trait labels in one round trip. */
    @Query("select s from SessionTraitScore s join fetch s.placement p join fetch p.trait"
            + " where s.attempt.id = :attemptId")
    List<SessionTraitScore> findWithPlacementsByAttemptId(@Param("attemptId") Long attemptId);

    boolean existsByPlacementId(Long placementId);
}
