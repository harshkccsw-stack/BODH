package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.delivery.SessionDemographic;

public interface SessionDemographicRepository extends JpaRepository<SessionDemographic, Long> {

    List<SessionDemographic> findByAttemptId(Long attemptId);

    Optional<SessionDemographic> findByAttemptIdAndFieldId(Long attemptId, Long fieldId);

    boolean existsByFieldId(Long fieldId);
}
