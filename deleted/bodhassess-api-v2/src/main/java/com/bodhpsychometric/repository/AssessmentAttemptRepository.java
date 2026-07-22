package com.bodhpsychometric.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.delivery.AssessmentAttempt;
import com.bodhpsychometric.model.delivery.AttemptStatus;

public interface AssessmentAttemptRepository extends JpaRepository<AssessmentAttempt, Long> {

    /** The attempt currently in play — at most one per session (service invariant). */
    Optional<AssessmentAttempt> findBySessionIdAndArchivedAtIsNull(Long sessionId);

    List<AssessmentAttempt> findBySessionIdOrderByAttemptNumberAsc(Long sessionId);

    /** Basis for numbering the next attempt on reset. */
    Optional<AssessmentAttempt> findTopBySessionIdOrderByAttemptNumberDesc(Long sessionId);

    List<AssessmentAttempt> findBySessionIdAndStatus(Long sessionId, AttemptStatus status);

    long countBySessionId(Long sessionId);
}
