package com.bodhpsychometric.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.delivery.SessionAnswer;

public interface SessionAnswerRepository extends JpaRepository<SessionAnswer, Long> {

    List<SessionAnswer> findByAttemptId(Long attemptId);

    /** Resume fetch: partial answers with their selections in one round trip. */
    @Query("select distinct a from SessionAnswer a left join fetch a.selectedOptions"
            + " where a.attempt.id = :attemptId")
    List<SessionAnswer> findWithSelectionsByAttemptId(@Param("attemptId") Long attemptId);

    Optional<SessionAnswer> findByAttemptIdAndItemId(Long attemptId, Long itemId);

    boolean existsByAttemptIdAndItemId(Long attemptId, Long itemId);

    long countByAttemptId(Long attemptId);
}
